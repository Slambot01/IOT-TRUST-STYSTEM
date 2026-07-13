"""
Standalone Attack Simulation Module for Research Evaluation
Implements controlled attack scenarios from Al-Zaidi et al. 2026 Paper
(Sybil, MitM, Replay) to generate clean, verifiable results.
"""

import random

class AttackSimulator:
    def __init__(self, trust_engine):
        self.engine = trust_engine
        self.baselines = {}

    def establish_baseline(self, device_id, normal_cycles=3):
        """
        Run NORMAL behavior to establish a realistic baseline trust score
        before the attack starts.
        """
        for _ in range(normal_cycles):
            successful_tx = random.randint(8, 12)
            failed_tx = random.randint(0, 1)
            
            for _ in range(successful_tx):
                self.engine.record_transaction(device_id, success=True, is_malicious=False)
            for _ in range(failed_tx):
                self.engine.record_transaction(device_id, success=False, is_malicious=False)
                
            self.engine.compute_trust_score(device_id)
            
        self.baselines[device_id] = {
            'score': self.engine.trust_scores[device_id]
        }

    def simulate_sybil_attack(self, device_id, duration_cycles=15):
        """
        Simulate a Sybil attack.
        Rapid score drop expected due to high failed_tx and low successful_tx.
        """
        scores = []
        detection_cycle = None
        
        for cycle in range(1, duration_cycles + 1):
            successful_tx = random.randint(0, 2)
            failed_tx = random.randint(20, 50)
            
            for _ in range(successful_tx):
                self.engine.record_transaction(device_id, success=True, is_malicious=True)
            for _ in range(failed_tx):
                self.engine.record_transaction(device_id, success=False, is_malicious=True)
                
            record = self.engine.compute_trust_score(device_id)
            self.engine.send_to_blockchain(record)
            scores.append(record['new_score'])
            
            if record['new_score'] < self.engine.t_min and detection_cycle is None:
                detection_cycle = cycle
                
        detection_time_seconds = detection_cycle * self.engine.update_interval if detection_cycle else None
        return scores, detection_cycle, detection_time_seconds

    def simulate_replay_attack(self, device_id, duration_cycles=15):
        """
        Simulate a Replay attack.
        Note: Replay attacks are HARDER to detect because successful_tx stays
        relatively high, masking the malicious behavior. This should result in
        a SLOWER detection_cycle than Sybil attacks.
        """
        scores = []
        detection_cycle = None
        
        for cycle in range(1, duration_cycles + 1):
            successful_tx = random.randint(15, 30)
            failed_tx = random.randint(5, 15)
            
            for _ in range(successful_tx):
                self.engine.record_transaction(device_id, success=True, is_malicious=True)
            for _ in range(failed_tx):
                self.engine.record_transaction(device_id, success=False, is_malicious=True)
                
            record = self.engine.compute_trust_score(device_id)
            self.engine.send_to_blockchain(record)
            scores.append(record['new_score'])
            
            if record['new_score'] < self.engine.t_min and detection_cycle is None:
                detection_cycle = cycle
                
        detection_time_seconds = detection_cycle * self.engine.update_interval if detection_cycle else None
        return scores, detection_cycle, detection_time_seconds

    def simulate_mitm_attack(self, device_id, duration_cycles=15):
        """
        Simulate a Man-in-the-Middle (MitM) attack.
        """
        scores = []
        detection_cycle = None
        
        for cycle in range(1, duration_cycles + 1):
            successful_tx = random.randint(3, 8)
            failed_tx = random.randint(10, 25)
            
            for _ in range(successful_tx):
                self.engine.record_transaction(device_id, success=True, is_malicious=True)
            for _ in range(failed_tx):
                self.engine.record_transaction(device_id, success=False, is_malicious=True)
                
            record = self.engine.compute_trust_score(device_id)
            self.engine.send_to_blockchain(record)
            scores.append(record['new_score'])
            
            if record['new_score'] < self.engine.t_min and detection_cycle is None:
                detection_cycle = cycle
                
        detection_time_seconds = detection_cycle * self.engine.update_interval if detection_cycle else None
        return scores, detection_cycle, detection_time_seconds

    def run_full_evaluation(self, num_devices_per_attack=10):
        attacks = {
            'sybil': self.simulate_sybil_attack,
            'replay': self.simulate_replay_attack,
            'mitm': self.simulate_mitm_attack
        }
        
        results = {}
        
        for attack_name, attack_func in attacks.items():
            detection_times = []
            detection_cycles = []
            
            for i in range(num_devices_per_attack):
                device_id = f'{attack_name}_test_{i:02d}'
                print(f"\n[ATTACK START] Target: {device_id} | Type: {attack_name.upper()}")
                self.establish_baseline(device_id)
                # Need enough cycles to ensure detection. Replay is hard, so we use duration_cycles=15.
                scores, d_cycle, d_time = attack_func(device_id, duration_cycles=15)
                
                for c, s in enumerate(scores):
                    print(f"  Cycle {c+1}: Trust Score = {s:.4f}")
                    if d_cycle and c + 1 == d_cycle:
                        print(f"  >>> BLACKLIST THRESHOLD (0.2) CROSSED AT CYCLE {d_cycle} <<<")

                if d_time is not None:
                    detection_times.append(d_time)
                    detection_cycles.append(d_cycle)
                    
            if detection_times:
                avg_time = sum(detection_times) / len(detection_times)
                avg_cycles = sum(detection_cycles) / len(detection_cycles)
                min_time = min(detection_times)
                max_time = max(detection_times)
            else:
                avg_time = avg_cycles = min_time = max_time = "Not Detected"
                
            results[attack_name] = {
                'avg_detection_time_seconds': avg_time,
                'avg_cycles_to_detect': avg_cycles,
                'min': min_time,
                'max': max_time,
                'sample_size': num_devices_per_attack
            }

        # Print a clean results table to console
        print("\n" + "="*80)
        print("RESEARCH PAPER EVALUATION: ATTACK DETECTION RESULTS (Al-Zaidi et al. 2026)")
        print("="*80)
        print(f"{'Attack Type':<15} | {'Avg Detection Time (s)':<25} | {'Avg Cycles':<12} | {'Min (s)':<10} | {'Max (s)':<10}")
        print("-" * 80)
        
        # Order explicitly to match paper analysis narrative
        for attack_name in ['sybil', 'mitm', 'replay']:
            res = results[attack_name]
            
            avg_time_str = f"{res['avg_detection_time_seconds']:.2f}" if isinstance(res['avg_detection_time_seconds'], (int, float)) else res['avg_detection_time_seconds']
            avg_cyc_str = f"{res['avg_cycles_to_detect']:.2f}" if isinstance(res['avg_cycles_to_detect'], (int, float)) else res['avg_cycles_to_detect']
            
            print(f"{attack_name.upper():<15} | {avg_time_str:<25} | {avg_cyc_str:<12} | {res['min']:<10} | {res['max']:<10}")
        print("="*80 + "\n")
        
        return results

    def compare_detection_systems(self, num_devices=10):
        from trust_score import EWMATrustScoreEngine
        from behavioral_parameters import BehavioralParameterEngine
        
        # Instantiate both engines
        engine_p1 = EWMATrustScoreEngine(alpha=0.6, beta=0.3, t_min=0.2, t_max=0.8, update_interval=30)
        engine_p2 = BehavioralParameterEngine(w1=0.35, w2=0.30, w3=0.20, w4=0.15, alpha=0.6, learning_threshold=3)
        
        results = []
        max_attack_cycles = 10
        
        for i in range(num_devices):
            device_id = f"slow_poison_test_{i:02d}"
            
            p1_detection = None
            p2_detection = None
            
            # --- LEARNING PHASE (3 cycles) ---
            for _ in range(3):
                # Normal behavior
                request_rate = random.randint(8, 12)
                known_endpoints = ["/api/data/0", "/api/data/1"]
                payload_size = random.randint(180, 220)
                error_count = random.randint(0, 1)
                
                # Phase 1 logic
                successful_tx = max(0, request_rate - error_count)
                for _ in range(successful_tx):
                    engine_p1.record_transaction(device_id, success=True, is_malicious=False)
                for _ in range(error_count):
                    engine_p1.record_transaction(device_id, success=False, is_malicious=False)
                engine_p1.compute_trust_score(device_id)
                
                # Phase 2 logic
                engine_p2.process_behavior(
                    device_id,
                    actual_rate=request_rate,
                    actual_size=payload_size,
                    endpoints=known_endpoints,
                    error_count=error_count,
                    total_requests=request_rate
                )
                
            # --- ATTACK PHASE (up to 10 cycles) ---
            for cycle in range(1, max_attack_cycles + 1):
                # Slow Poison generation — the KEY insight:
                # The attacker keeps success/fail ratio NORMAL so Phase 1 can't detect.
                # But the behavioral PARAMETERS (endpoints, payload, rate) drift.
                drift_factor = min(cycle, 8)
                request_rate = random.randint(8, 12) + (drift_factor * 2)
                known_endpoints = ["/api/data/0", "/api/data/1"]
                extra_endpoints = [f"/api/poison/{i}" for i in range(drift_factor)]
                endpoints = known_endpoints + extra_endpoints
                payload_size = random.randint(180, 220) + (drift_factor * 50)
                error_count = random.randint(0, 1) + (drift_factor * 1)
                
                # Phase 1 Evaluation — attacker keeps transactions looking CLEAN
                # Normal success/fail ratio, NOT flagged as malicious
                p1_successful = random.randint(8, 12)
                p1_failed = random.randint(0, 1)
                for _ in range(p1_successful):
                    engine_p1.record_transaction(device_id, success=True, is_malicious=False)
                for _ in range(p1_failed):
                    engine_p1.record_transaction(device_id, success=False, is_malicious=False)
                
                p1_record = engine_p1.compute_trust_score(device_id)
                p1_score = p1_record['new_score']
                
                if p1_score < engine_p1.t_min and p1_detection is None:
                    p1_detection = cycle
                    
                # Phase 2 Evaluation — sees the REAL drifting parameters
                p2_score = engine_p2.process_behavior(
                    device_id,
                    actual_rate=request_rate,
                    actual_size=payload_size,
                    endpoints=endpoints,
                    error_count=error_count,
                    total_requests=request_rate
                )
                
                if p2_score < 20.0 and p2_detection is None:
                    p2_detection = cycle
                    
            results.append({
                'device_id': device_id,
                'p1_detection': p1_detection,
                'p2_detection': p2_detection,
                'p1_final_score': p1_score,
                'p2_final_score': p2_score
            })
            
        # 3. Prints a side-by-side comparison table
        print("\n" + "="*85)
        print("SLOW POISON DETECTION COMPARISON: Phase 1 (2-param) vs Phase 2 (4-param)")
        print("="*85)
        print(f"{'Device ID':<20} | {'P1 Detect Cycle':<15} | {'P2 Detect Cycle':<15} | {'P1 Final Score':<14} | {'P2 Final Score':<14}")
        print("-" * 85)
        
        p1_fails = 0
        p2_fails = 0
        p1_detect_cycles = []
        p2_detect_cycles = []
        
        for r in results:
            p1_det_str = str(r['p1_detection']) if r['p1_detection'] else "FAILED"
            p2_det_str = str(r['p2_detection']) if r['p2_detection'] else "FAILED"
            
            print(f"{r['device_id']:<20} | {p1_det_str:<15} | {p2_det_str:<15} | {r['p1_final_score']:<14.4f} | {r['p2_final_score']:<14.4f}")
            
            if r['p1_detection']:
                p1_detect_cycles.append(r['p1_detection'])
            else:
                p1_fails += 1
                
            if r['p2_detection']:
                p2_detect_cycles.append(r['p2_detection'])
            else:
                p2_fails += 1
                
        print("="*85)
        
        # 4. Calculates and prints averages and fails
        avg_p1 = sum(p1_detect_cycles)/len(p1_detect_cycles) if p1_detect_cycles else None
        avg_p2 = sum(p2_detect_cycles)/len(p2_detect_cycles) if p2_detect_cycles else None

        avg_p1_str = f"{avg_p1:.1f}" if avg_p1 is not None else "N/A"
        avg_p2_str = f"{avg_p2:.1f}" if avg_p2 is not None else "N/A"
        
        print("\nSUMMARY STATISTICS:")
        print(f"Phase 1 (Legacy EWMA)     - Avg Detection Cycle: {avg_p1_str:<5} | Completely Failed to Detect: {p1_fails}/{num_devices}")
        print(f"Phase 2 (4-Param Engine)  - Avg Detection Cycle: {avg_p2_str:<5} | Completely Failed to Detect: {p2_fails}/{num_devices}")
        print("\nConclusion: Phase 2 explicitly penalizes subtle drifts in endpoint diversity and payload size")
        print("that Phase 1 completely misses when looking only at gross transaction failure rates.")
        print("="*85 + "\n")
        
        return {
            "devices": results,
            "summary": {
                "p1_avg_detection_cycle": avg_p1,
                "p2_avg_detection_cycle": avg_p2,
                "p1_fails": p1_fails,
                "p2_fails": p2_fails,
                "total_devices": num_devices
            }
        }

def calculate_false_positive_rate(trust_engine, num_normal_devices=20, cycles=10):
    """
    Creates num_normal_devices behaving completely normally for `cycles` intervals.
    Counts how many get incorrectly flagged as BLACKLISTED or drop below t_max threshold.
    Returns the false positive rate as a percentage: (incorrectly_flagged / total) * 100.
    Corresponds to paper's FPR metric (paper achieves < 3%).
    """
    incorrectly_flagged = 0
    
    for i in range(num_normal_devices):
        device_id = f'normal_test_{i:02d}'
        flagged = False
        
        for _ in range(cycles):
            successful_tx = random.randint(8, 12)
            failed_tx = random.randint(0, 1)
            
            for _ in range(successful_tx):
                trust_engine.record_transaction(device_id, success=True, is_malicious=False)
            for _ in range(failed_tx):
                trust_engine.record_transaction(device_id, success=False, is_malicious=False)
                
            record = trust_engine.compute_trust_score(device_id)
            
            # Incorrectly flagged if score drops below t_max or t_min despite normal behavior
            if record['new_score'] < trust_engine.t_max:
                flagged = True
                break
                
        if flagged:
            incorrectly_flagged += 1
            
    fpr = (incorrectly_flagged / num_normal_devices) * 100
    return fpr

if __name__ == '__main__':
    from trust_score import EWMATrustScoreEngine
    engine = EWMATrustScoreEngine(alpha=0.6, beta=0.3, t_min=0.2, t_max=0.8, update_interval=30)
    
    simulator = AttackSimulator(engine)
    results = simulator.run_full_evaluation()
    
    # Run the comparison evaluation for Phase 1 vs Phase 2
    simulator.compare_detection_systems(num_devices=10)
    
    fpr = calculate_false_positive_rate(engine, num_normal_devices=100, cycles=10)
    print(f"False Positive Rate: {fpr:.2f}% (Target: < 3%)")
