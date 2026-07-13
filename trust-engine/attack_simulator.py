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
    
    fpr = calculate_false_positive_rate(engine, num_normal_devices=100, cycles=10)
    print(f"False Positive Rate: {fpr:.2f}% (Target: < 3%)")
