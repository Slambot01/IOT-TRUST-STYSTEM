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
from behavioral_parameters import BehavioralParameterEngine
from behavioral_monitor import generate_normal_device_behavior, generate_attack_behavior
from attack_simulator import AttackSimulator

app = Flask(__name__)
# Enable CORS for Member 3's dashboard on any port
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Global Engine instances shared across all requests
engine = EWMATrustScoreEngine(alpha=0.6, beta=0.3, t_min=0.2, t_max=0.8, update_interval=30)
engine_v2 = BehavioralParameterEngine(w1=0.35, w2=0.30, w3=0.20, w4=0.15, alpha=0.6, learning_threshold=3)

# Setup simulation devices for the background thread
device_ids = [f'device_{i:03d}' for i in range(100)]
malicious_devices = random.sample(device_ids, 20)
attack_types = ['ddos', 'data_exfiltration', 'slow_poison']
device_attack_map = {dev_id: random.choice(attack_types) for dev_id in malicious_devices}

blockchain_acknowledgements = []

# V2 Tier logic mappings
def get_v2_tier(score):
    if score >= 80.0:
        return 'FULL_ACCESS'
    elif score >= 50.0:
        return 'RESTRICTED'
    elif score >= 20.0:
        return 'QUARANTINED'
    return 'REVOKED'

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
                if cycle <= engine_v2.learning_threshold:
                    behavior = generate_normal_device_behavior(dev_id, cycle)
                else:
                    behavior = generate_attack_behavior(dev_id, device_attack_map[dev_id], cycle - engine_v2.learning_threshold)
            else:
                behavior = generate_normal_device_behavior(dev_id, cycle)
                
            # Phase 1 Logic
            successful_tx = max(0, behavior['request_rate'] - behavior['error_count'])
            for _ in range(successful_tx):
                engine.record_transaction(dev_id, success=True, is_malicious=behavior['is_malicious'])
            for _ in range(behavior['error_count']):
                engine.record_transaction(dev_id, success=False, is_malicious=behavior['is_malicious'])
                
            # Phase 2 Logic
            engine_v2.process_behavior(
                dev_id,
                actual_rate=behavior['request_rate'],
                actual_size=behavior['payload_size'],
                endpoints=behavior['endpoints'],
                error_count=behavior['error_count'],
                total_requests=behavior['total_requests']
            )
                
        # 2. Process all Phase 1 updates
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

# ==============================================================================
# PHASE 2 / V2 ENDPOINTS
# ==============================================================================

@app.route('/api/trust/v2/all', methods=['GET'])
def get_all_v2_trust_scores():
    result = []
    for device_id, score in engine_v2.trust_scores.items():
        device_data = engine_v2.device_baselines.get(device_id, {})
        
        # In learning phase, we might not have p1-p4 computed yet
        result.append({
            'deviceId': device_id,
            'score': round(score, 4),
            'compositeScore': round(device_data.get('last_composite', 100.0), 4),
            'tier': get_v2_tier(score),
            'isLearning': device_data.get('is_learning', True),
            'subScores': {
                'p1_request_rate': round(device_data.get('last_p1', 100.0), 4),
                'p2_endpoint_consistency': round(device_data.get('last_p2', 100.0), 4),
                'p3_payload_size': round(device_data.get('last_p3', 100.0), 4),
                'p4_error_rate': round(device_data.get('last_p4', 100.0), 4)
            }
        })
        
    return jsonify(result), 200

@app.route('/api/trust/v2/tier/<tier_name>', methods=['GET'])
def get_v2_devices_by_tier(tier_name):
    tier_name = tier_name.upper()
    valid_tiers = ['FULL_ACCESS', 'RESTRICTED', 'QUARANTINED', 'REVOKED']
    
    if tier_name not in valid_tiers:
        return jsonify({"error": f"Invalid tier. Must be one of {valid_tiers}"}), 400
        
    result = []
    for device_id, score in engine_v2.trust_scores.items():
        if get_v2_tier(score) == tier_name:
            device_data = engine_v2.device_baselines.get(device_id, {})
            result.append({
                'deviceId': device_id,
                'score': round(score, 4),
                'tier': tier_name,
                'isLearning': device_data.get('is_learning', True)
            })
            
    return jsonify(result), 200

@app.route('/api/trust/v2/comparison', methods=['GET'])
def get_v2_comparison():
    try:
        import random as _rnd
        from behavioral_parameters import BehavioralParameterEngine
        
        ep1 = EWMATrustScoreEngine(alpha=0.6, beta=0.3, t_min=0.2, t_max=0.8, update_interval=30)
        ep2 = BehavioralParameterEngine(w1=0.35, w2=0.30, w3=0.20, w4=0.15, alpha=0.6, learning_threshold=3)
        
        results = []
        num_devices = 10
        
        for i in range(num_devices):
            dev = f"slow_poison_test_{i:02d}"
            p1_det = None
            p2_det = None
            p1_score = 1.0
            p2_score = 100.0
            
            # Learning phase (3 cycles) — normal behavior for both
            for _ in range(3):
                rate = _rnd.randint(8, 12)
                errs = _rnd.randint(0, 1)
                good = max(0, rate - errs)
                for _ in range(good):
                    ep1.record_transaction(dev, success=True, is_malicious=False)
                for _ in range(errs):
                    ep1.record_transaction(dev, success=False, is_malicious=False)
                ep1.compute_trust_score(dev)
                ep2.process_behavior(dev, actual_rate=rate, actual_size=_rnd.randint(180,220),
                    endpoints=["/api/data/0", "/api/data/1"], error_count=errs, total_requests=rate)
            
            # Attack phase (10 cycles)
            for cyc in range(1, 11):
                drift = min(cyc, 8)
                
                # Phase 1 sees NORMAL transactions (attacker hides)
                p1_good = _rnd.randint(8, 12)
                p1_bad = _rnd.randint(0, 1)
                for _ in range(p1_good):
                    ep1.record_transaction(dev, success=True, is_malicious=False)
                for _ in range(p1_bad):
                    ep1.record_transaction(dev, success=False, is_malicious=False)
                rec = ep1.compute_trust_score(dev)
                p1_score = rec['new_score']
                if p1_score < ep1.t_min and p1_det is None:
                    p1_det = cyc
                
                # Phase 2 sees DRIFTING behavioral parameters
                atk_rate = _rnd.randint(8, 12) + (drift * 2)
                atk_size = _rnd.randint(180, 220) + (drift * 50)
                atk_errs = _rnd.randint(0, 1) + drift
                atk_eps = ["/api/data/0", "/api/data/1"] + [f"/api/poison/{j}" for j in range(drift)]
                p2_score = ep2.process_behavior(dev, actual_rate=atk_rate, actual_size=atk_size,
                    endpoints=atk_eps, error_count=atk_errs, total_requests=atk_rate)
                if p2_score < 20.0 and p2_det is None:
                    p2_det = cyc
            
            results.append({
                "device_id": dev, "p1_detection": p1_det, "p2_detection": p2_det,
                "p1_final_score": p1_score, "p2_final_score": p2_score
            })
        
        p1_dets = [r['p1_detection'] for r in results if r['p1_detection'] is not None]
        p2_dets = [r['p2_detection'] for r in results if r['p2_detection'] is not None]
        
        summary = {
            "p1_avg_detection_cycle": round(sum(p1_dets)/len(p1_dets), 1) if p1_dets else "N/A",
            "p2_avg_detection_cycle": round(sum(p2_dets)/len(p2_dets), 1) if p2_dets else "N/A",
            "p1_fails": num_devices - len(p1_dets),
            "p2_fails": num_devices - len(p2_dets),
            "total_devices": num_devices
        }
        
        return jsonify({"devices": results, "summary": summary}), 200
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

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
