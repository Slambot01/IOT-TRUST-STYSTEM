"""
Trust Engine API Server
Exposes trust score data for Member 3's React dashboard.
Runs background simulation to continuously feed data.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import threading
import time
import random
from trust_score import EWMATrustScoreEngine
from behavioral_monitor import generate_normal_device_behavior, generate_attack_behavior

app = Flask(__name__)
# Enable CORS for Member 3's dashboard on any port
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Global Engine instance shared across all requests
engine = EWMATrustScoreEngine(alpha=0.6, beta=0.3, t_min=0.2, t_max=0.8, update_interval=30)

# Setup simulation devices for the background thread
device_ids = [f'device_{i:03d}' for i in range(100)]
malicious_devices = random.sample(device_ids, 20)
attack_types = ['sybil', 'replay', 'mitm']
device_attack_map = {dev_id: random.choice(attack_types) for dev_id in malicious_devices}

blockchain_acknowledgements = []

def background_update_task():
    """
    Background thread that runs engine.run_update_cycle() automatically 
    every 30 seconds for a fixed list of device IDs.
    """
    cycle = 1
    while True:
        # 1. Simulate transactions for this interval
        for dev_id in device_ids:
            if dev_id in malicious_devices:
                behavior = generate_attack_behavior(dev_id, device_attack_map[dev_id])
            else:
                behavior = generate_normal_device_behavior(dev_id, cycle)
                
            for _ in range(behavior['successful_transactions']):
                engine.record_transaction(dev_id, success=True, is_malicious=behavior['is_malicious'])
            for _ in range(behavior['failed_transactions']):
                engine.record_transaction(dev_id, success=False, is_malicious=behavior['is_malicious'])
                
        # 2. Process all updates
        engine.run_update_cycle(device_ids)
        cycle += 1
        
        # 3. Sleep for the interval defined in the paper
        time.sleep(30)

def get_status_from_score(score):
    if score < engine.t_min:
        return 'BLACKLISTED'
    elif score >= engine.t_max:
        return 'HIGHLY_TRUSTED'
    return 'TRUSTED'

@app.route('/api/trust/all', methods=['GET'])
def get_all_trust_scores():
    stats = engine.get_statistics()
    current_scores = stats['current_scores']
    
    result = []
    for device_id, score in current_scores.items():
        result.append({
            'deviceId': device_id,
            'score': score,
            'normalizedScore': round(score * 100, 4),
            'status': get_status_from_score(score)
        })
        
    return jsonify(result), 200

@app.route('/api/trust/<device_id>', methods=['GET'])
def get_single_trust_score(device_id):
    if device_id not in engine.trust_scores:
        return jsonify({"error": f"Device {device_id} not found"}), 404
        
    score = engine.trust_scores[device_id]
    return jsonify({
        'deviceId': device_id,
        'score': round(score, 4),
        'normalizedScore': round(score * 100, 4),
        'status': get_status_from_score(score)
    }), 200

@app.route('/api/trust/history/<device_id>', methods=['GET'])
def get_trust_history(device_id):
    if device_id not in engine.update_history:
        return jsonify([]), 200
        
    return jsonify(engine.update_history[device_id]), 200

@app.route('/api/trust/update', methods=['POST'])
def receive_blockchain_update():
    """
    Endpoint for Member 1's blockchain event listener OR my own
    trust_score.py's send_to_blockchain() function to call.
    """
    data = request.json
    if not data:
        return jsonify({"error": "No JSON payload provided"}), 400
        
    blockchain_acknowledgements.append(data)
    # Log quietly so it doesn't clutter the console too much
    # print(f"[API] Logged update for {data.get('device_id', 'unknown')}")
    
    return jsonify({"success": True}), 200

@app.route('/api/stats', methods=['GET'])
def get_stats():
    stats = engine.get_statistics()
    current_scores = list(stats['current_scores'].values())
    
    average_score = sum(current_scores) / len(current_scores) if current_scores else 0
    
    return jsonify({
        'total_devices': stats['total_devices'],
        'total_updates': stats['total_updates'],
        'total_blacklisted': stats['total_blacklisted'],
        'average_score': round(average_score, 4),
        'paper_parameters': stats['paper_parameters']
    }), 200

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'running',
        'port': 3002,
        'paper': 'Al-Zaidi et al. IEEE IoT Journal 2026'
    }), 200

if __name__ == '__main__':
    # Start the background trust score update thread (daemon means it closes when Flask closes)
    thread = threading.Thread(target=background_update_task, daemon=True)
    thread.start()
    
    # Run the server (use_reloader=False prevents Flask from starting the thread twice in debug mode)
    app.run(port=3002, debug=True, use_reloader=False)
