import sys
from trust_score import EWMATrustScoreEngine
from attack_simulator import AttackSimulator, calculate_false_positive_rate
from behavioral_monitor import generate_normal_device_behavior

def run_tests():
    print("=" * 60)
    print("Integration Tests for Trust Score Engine")
    print("=" * 60)
    
    engine = EWMATrustScoreEngine(alpha=0.6, beta=0.3, t_min=0.2, t_max=0.8, update_interval=30)
    simulator = AttackSimulator(engine)
    
    tests_passed = 0
    total_tests = 3
    
    # Test 1: Normal Devices stay Highly Trusted
    print("\n--- Test 1: Normal Devices ---")
    try:
        device_ids = [f'test_normal_{i}' for i in range(5)]
        
        # Run 2 update cycles for these 5 devices
        for cycle in range(1, 3):
            for dev_id in device_ids:
                behavior = generate_normal_device_behavior(dev_id, cycle)
                # Feed normal transactions
                for _ in range(behavior['successful_transactions']):
                    engine.record_transaction(dev_id, success=True, is_malicious=False)
                for _ in range(behavior['failed_transactions']):
                    engine.record_transaction(dev_id, success=False, is_malicious=False)
            
            # Note: run_update_cycle also prints output to console
            engine.run_update_cycle(device_ids)
            
        # Verify all remained highly trusted (>= t_max)
        all_highly_trusted = all(engine.trust_scores[dev_id] >= engine.t_max for dev_id in device_ids)
        assert all_highly_trusted, "Not all normal devices stayed above t_max (0.8)"
        
        print("[PASS] Normal devices successfully maintained HIGHLY_TRUSTED status.")
        tests_passed += 1
    except Exception as e:
        print(f"[FAIL] Normal Devices test failed: {str(e)}")

    # Test 2: Sybil attack gets Blacklisted within 5 cycles
    print("\n--- Test 2: Sybil Attack Detection ---")
    try:
        sybil_id = 'test_sybil_01'
        simulator.establish_baseline(sybil_id, normal_cycles=3)
        scores, detection_cycle, detection_time = simulator.simulate_sybil_attack(sybil_id, duration_cycles=5)
        
        assert detection_cycle is not None, "Sybil attack was not detected within 5 cycles"
        assert detection_cycle <= 5, f"Detection took too long: {detection_cycle} cycles"
        
        print(f"[PASS] Sybil attack correctly detected and blacklisted in {detection_cycle} cycle(s).")
        tests_passed += 1
    except Exception as e:
        print(f"[FAIL] Sybil Attack Detection test failed: {str(e)}")

    # Test 3: False Positive Rate < 5%
    print("\n--- Test 3: False Positive Rate ---")
    try:
        fpr = calculate_false_positive_rate(engine, num_normal_devices=20, cycles=10)
        assert fpr < 5.0, f"False Positive Rate too high: {fpr}%"
        
        print(f"[PASS] False Positive Rate is {fpr}% (Below 5% threshold).")
        tests_passed += 1
    except Exception as e:
        print(f"[FAIL] False Positive Rate test failed: {str(e)}")

    print("\n" + "=" * 60)
    print(f"SUMMARY: {tests_passed}/{total_tests} tests passed.")
    print("=" * 60)

if __name__ == '__main__':
    run_tests()
