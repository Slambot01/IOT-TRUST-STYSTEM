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

def generate_normal_device_behavior(device_id, step):
    """
    Simulates one interval of NORMAL IoT device behavior.
    """
    return {
        "device_id": device_id,
        "timestamp": datetime.datetime.now().isoformat(),
        "successful_transactions": random.randint(8, 12),
        "failed_transactions": random.randint(0, 1),
        "is_malicious": False,
        "behavior_type": "NORMAL"
    }

def generate_attack_behavior(device_id, attack_type):
    """
    Simulates one interval of an ATTACK behavior.
    """
    if attack_type == 'sybil':
        return {
            "device_id": device_id,
            "timestamp": datetime.datetime.now().isoformat(),
            "successful_transactions": random.randint(0, 2),
            "failed_transactions": random.randint(20, 50),
            "is_malicious": True,
            "behavior_type": "SYBIL_ATTACK"
        }
    elif attack_type == 'replay':
        return {
            "device_id": device_id,
            "timestamp": datetime.datetime.now().isoformat(),
            "successful_transactions": random.randint(15, 30),
            "failed_transactions": random.randint(5, 15),
            "is_malicious": True,
            "behavior_type": "REPLAY_ATTACK"
        }
    elif attack_type == 'mitm':
        return {
            "device_id": device_id,
            "timestamp": datetime.datetime.now().isoformat(),
            "successful_transactions": random.randint(3, 8),
            "failed_transactions": random.randint(10, 25),
            "is_malicious": True,
            "behavior_type": "MITM_ATTACK"
        }

def run_base_paper_simulation():
    # 1. Print header
    print("=" * 80)
    print("Al-Zaidi et al. 2026 Base Paper Simulation")
    print("=" * 80)

    # 2. Create engine with exact paper parameters
    engine = EWMATrustScoreEngine(alpha=0.6, beta=0.3, t_min=0.2, t_max=0.8, update_interval=30)

    # 3. Create 100 device IDs
    device_ids = [f'device_{i:03d}' for i in range(100)]

    # 4. Randomly select 20% to be malicious
    num_malicious = int(len(device_ids) * 0.2)
    malicious_devices = random.sample(device_ids, num_malicious)
    attack_types = ['sybil', 'replay', 'mitm']
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

    # 6. Run 10 update cycles
    num_cycles = 10
    for cycle in range(1, num_cycles + 1):
        print(f"--- Starting Cycle {cycle}/{num_cycles} ---")
        
        for dev_id in device_ids:
            # Generate behavior based on whether device is in malicious set
            if dev_id in malicious_devices:
                behavior = generate_attack_behavior(dev_id, device_attack_map[dev_id])
            else:
                behavior = generate_normal_device_behavior(dev_id, cycle)
                
            # Aggregate success flag based on behavior (success = successful_transactions > failed_transactions)
            is_overall_success = behavior['successful_transactions'] > behavior['failed_transactions']
            
            # Record individual transactions to accurately fill S (successful_tx) and F (failed_tx) counters for the formula
            # Normal transactions are registered as successful
            for _ in range(behavior['successful_transactions']):
                engine.record_transaction(dev_id, success=True, is_malicious=behavior['is_malicious'])
                
            # Failed transactions are registered as failed
            for _ in range(behavior['failed_transactions']):
                engine.record_transaction(dev_id, success=False, is_malicious=behavior['is_malicious'])
                
            # If the user instruction meant just 1 aggregate record call based on overall success:
            # engine.record_transaction(dev_id, success=is_overall_success, is_malicious=behavior['is_malicious'])
            # (We iterate to ensure S and F are fully populated according to the generated bounds)

        # Process all devices for this interval
        engine.run_update_cycle(device_ids)
        
        # Calculate summary for this cycle
        scores = list(engine.trust_scores.values())
        avg_score = sum(scores) / len(scores)
        blacklisted_count = sum(1 for s in scores if s < engine.t_min)
        
        print(f"Cycle {cycle} Summary:")
        print(f"  Average Trust Score: {avg_score:.4f}")
        print(f"  Blacklisted Devices: {blacklisted_count} (Paper Benchmark achieves >92% detection)")
        print("-" * 80)
        
        time.sleep(1) # Simulated interval delay
        
    # 7. Print final statistics as pretty-printed JSON
    print("\nFINAL STATISTICS:")
    stats = engine.get_statistics()
    print(json.dumps(stats, indent=4))
    
    # 8. Return (engine, stats)
    return engine, stats

if __name__ == '__main__':
    run_base_paper_simulation()
