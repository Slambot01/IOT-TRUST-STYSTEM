"""
Behavioral Monitor and Attack Simulator
Implements the edge-node anomaly detection described in Al-Zaidi et al.
paper Section III-B: "Edge nodes perform anomaly detection before transactions
are validated, filtering out compromised transactions"
"""

import time
import json
import random
import requests
import datetime
from trust_score import EWMATrustScoreEngine
from behavioral_parameters import BehavioralParameterEngine

def generate_normal_device_behavior(device_id, step):
    """
    Simulates one interval of NORMAL IoT device behavior.
    """
    request_rate = random.randint(8, 12)
    known_endpoints_count = random.randint(2, 3)
    endpoints = [f"/api/data/{i}" for i in range(known_endpoints_count)]
    
    return {
        "device_id": device_id,
        "timestamp": datetime.datetime.now().isoformat(),
        "request_rate": request_rate,
        "endpoints": endpoints,
        "payload_size": random.randint(180, 220),
        "error_count": random.randint(0, 1),
        "total_requests": request_rate,
        "is_malicious": False,
        "behavior_type": "NORMAL"
    }

def generate_attack_behavior(device_id, attack_type, cycle):
    """
    Simulates one interval of an ATTACK behavior.
    """
    if attack_type == 'ddos':
        request_rate = random.randint(250, 400)
        return {
            "device_id": device_id,
            "timestamp": datetime.datetime.now().isoformat(),
            "request_rate": request_rate,
            "payload_size": random.randint(180, 220),
            "endpoints": ["/api/data/0", "/api/data/1"],
            "error_count": random.randint(10, 20),
            "total_requests": request_rate,
            "is_malicious": True,
            "behavior_type": "DDOS_ATTACK"
        }
    elif attack_type == 'data_exfiltration':
        request_rate = random.randint(8, 12)
        known_endpoints = ["/api/data/0", "/api/data/1"]
        extra_endpoints = [f"/api/hidden/{i}" for i in range(random.randint(23, 43))]
        return {
            "device_id": device_id,
            "timestamp": datetime.datetime.now().isoformat(),
            "request_rate": request_rate,
            "payload_size": random.randint(8000, 15000),
            "endpoints": known_endpoints + extra_endpoints,
            "error_count": random.randint(0, 1),
            "total_requests": request_rate,
            "is_malicious": True,
            "behavior_type": "DATA_EXFILTRATION_ATTACK"
        }
    elif attack_type == 'slow_poison':
        drift_factor = min(cycle, 8)
        request_rate = random.randint(8, 12) + (drift_factor * 2)
        known_endpoints = ["/api/data/0", "/api/data/1"]
        extra_endpoints = [f"/api/poison/{i}" for i in range(drift_factor)]
        payload_size = random.randint(180, 220) + (drift_factor * 50)
        error_count = random.randint(0, 1) + (drift_factor * 1)
        return {
            "device_id": device_id,
            "timestamp": datetime.datetime.now().isoformat(),
            "request_rate": request_rate,
            "payload_size": payload_size,
            "endpoints": known_endpoints + extra_endpoints,
            "error_count": error_count,
            "total_requests": request_rate,
            "is_malicious": True,
            "behavior_type": "SLOW_POISON_ATTACK"
        }

def run_base_paper_simulation():
    # 1. Print header
    print("=" * 80)
    print("4-Parameter Behavioral Trust Engine Simulation")
    print("=" * 80)

    # 2. Create engine
    engine = BehavioralParameterEngine(w1=0.35, w2=0.30, w3=0.20, w4=0.15, alpha=0.6, learning_threshold=3)

    # 3. Create 100 device IDs
    device_ids = [f'device_{i:03d}' for i in range(100)]

    # 4. Randomly select 20% to be malicious
    num_malicious = int(len(device_ids) * 0.2)
    malicious_devices = random.sample(device_ids, num_malicious)
    attack_types = ['ddos', 'data_exfiltration', 'slow_poison']
    device_attack_map = {dev_id: random.choice(attack_types) for dev_id in malicious_devices}

    # 5. Print setup summary
    print(f"Total Devices: {len(device_ids)}")
    print(f"Malicious Devices: {len(malicious_devices)}")
    print(f"Attack Types Distribution:")
    for at in attack_types:
        count = list(device_attack_map.values()).count(at)
        print(f"  - {at}: {count}")
    print("-" * 80)
    
    time.sleep(2) # Brief pause before simulation begins

    # 6. Run 12 update cycles (3 learning + 9 active)
    num_cycles = 12
    for cycle in range(1, num_cycles + 1):
        print(f"--- Starting Cycle {cycle}/{num_cycles} ---")
        
        for dev_id in device_ids:
            # Generate behavior based on whether device is in malicious set
            if dev_id in malicious_devices:
                # Delay attacks until after learning phase (e.g., after cycle 3)
                if cycle <= engine.learning_threshold:
                    behavior = generate_normal_device_behavior(dev_id, cycle)
                else:
                    behavior = generate_attack_behavior(dev_id, device_attack_map[dev_id], cycle - engine.learning_threshold)
            else:
                behavior = generate_normal_device_behavior(dev_id, cycle)
                
            # Process behavior. This internally calls compute_p1/p2/p3/p4, 
            # compute_composite_score, and compute_final_score after the learning phase.
            score = engine.process_behavior(
                dev_id, 
                actual_rate=behavior['request_rate'],
                actual_size=behavior['payload_size'],
                endpoints=behavior['endpoints'],
                error_count=behavior['error_count'],
                total_requests=behavior['total_requests']
            )

        # Calculate summary for this cycle
        scores = list(engine.trust_scores.values())
        if scores:
            avg_score = sum(scores) / len(scores)
            # Threshold for blacklisting based on the 0-100 scale
            t_min = 50.0 
            blacklisted_count = sum(1 for s in scores if s < t_min)
            
            # Status icon visualization
            if cycle <= engine.learning_threshold:
                status_icon = "⏳ (Learning)"
            else:
                status_icon = "🔴 (Attacks Detected)" if blacklisted_count > 0 else "🟢 (Normal)"
            
            print(f"Cycle {cycle} Summary {status_icon}:")
            print(f"  Average Trust Score: {avg_score:.2f}/100.0")
            print(f"  Blacklisted Devices (<{t_min}): {blacklisted_count} / {len(malicious_devices)} known malicious")
        print("-" * 80)
        
        time.sleep(1) # Simulated interval delay
        
    # 7. Print final statistics
    print("\nFINAL STATISTICS:")
    stats = {
        "total_devices": len(device_ids),
        "malicious_devices_injected": len(malicious_devices),
        "blacklisted_count": sum(1 for s in engine.trust_scores.values() if s < 50.0),
        "average_score": sum(engine.trust_scores.values()) / len(device_ids) if engine.trust_scores else 0
    }
    print(json.dumps(stats, indent=4))
    
    # 8. Return (engine, stats)
    return engine, stats

if __name__ == '__main__':
    run_base_paper_simulation()
