class BehavioralParameterEngine:
    """
    BehavioralParameterEngine
    
    This class extends Al-Zaidi et al.'s single-ratio EWMA into a 4-parameter 
    weighted composite trust score, effectively addressing Gap 2 from our 
    literature review: "No composite trust score formula — no weighted 
    mathematical formula combining behavioral dimensions."
    
    The engine incorporates a "learning phase" (e.g., 3 normal cycles) for 
    each device to establish baseline values (request rates, payload sizes, 
    and known endpoints) before active scoring begins. The final trust score 
    is computed by temporally smoothing the composite sub-score using an EWMA 
    formula, maintaining continuous dynamic trust evaluation.
    """
    
    def __init__(self, w1=0.35, w2=0.30, w3=0.20, w4=0.15, alpha=0.6, learning_threshold=3):
        # Ensure weights sum up to 1.0
        assert abs(w1 + w2 + w3 + w4 - 1.0) < 1e-6, "Weights must sum to 1.0"
        
        self.w1 = w1
        self.w2 = w2
        self.w3 = w3
        self.w4 = w4
        self.alpha = alpha
        
        self.trust_scores = {}  # device_id -> float (0-100 scale)
        self.device_baselines = {}  # device_id -> dict of baseline data
        self.learning_threshold = learning_threshold

    def _initialize_device(self, device_id):
        """
        Initializes the tracking data for a new device, starting it in the learning phase.
        """
        if device_id not in self.device_baselines:
            self.device_baselines[device_id] = {
                'cycle_count': 0,
                'is_learning': True,
                'baseline_rate': 0.0,
                'baseline_size': 0.0,
                'known_endpoints': set(),
                'history_rates': [],
                'history_sizes': []
            }

    def process_behavior(self, device_id, actual_rate, actual_size, endpoints, error_count, total_requests):
        """
        Main entry point for processing a cycle of behavior for a device.
        - If the device is in the learning phase, it records data to build baselines.
        - Once learning completes, it computes the 4 sub-scores, the composite score,
          and returns the EWMA smoothed final trust score.
          
        endpoints should be a list or set of endpoints accessed during this cycle.
        """
        self._initialize_device(device_id)
        device_data = self.device_baselines[device_id]
        
        # ----------------------------------------------------
        # Phase 1: Learning Phase (3 normal cycles)
        # ----------------------------------------------------
        if device_data['is_learning']:
            device_data['history_rates'].append(actual_rate)
            device_data['history_sizes'].append(actual_size)
            device_data['known_endpoints'].update(endpoints)
            device_data['cycle_count'] += 1
            
            # Check if the learning phase has completed
            if device_data['cycle_count'] >= self.learning_threshold:
                device_data['is_learning'] = False
                
                # Compute and store baselines
                rates = device_data['history_rates']
                sizes = device_data['history_sizes']
                device_data['baseline_rate'] = sum(rates) / len(rates) if rates else 0.0
                device_data['baseline_size'] = sum(sizes) / len(sizes) if sizes else 0.0
                
            # While learning, we assume full trust (100.0) or their existing score
            return self.trust_scores.get(device_id, 100.0)

        # ----------------------------------------------------
        # Phase 2: Active Scoring Phase
        # ----------------------------------------------------
        baseline_rate = device_data['baseline_rate']
        baseline_size = device_data['baseline_size']
        known_endpoints_set = device_data['known_endpoints']
        
        # Determine consistency of endpoint access
        accessed_endpoints_set = set(endpoints)
        known_endpoints_count = len(accessed_endpoints_set.intersection(known_endpoints_set))
        total_endpoints_count = len(accessed_endpoints_set)
        
        # Step A: Compute Sub-scores
        p1 = self.compute_p1_request_rate(actual_rate, baseline_rate)
        p2 = self.compute_p2_endpoint_consistency(known_endpoints_count, total_endpoints_count)
        p3 = self.compute_p3_payload_size(actual_size, baseline_size)
        p4 = self.compute_p4_error_rate(error_count, total_requests)
        
        # Step B: Compute Composite Score
        composite_score = self.compute_composite_score(p1, p2, p3, p4)
        
        # Step C: Combine with Phase 1 EWMA smoothing logic
        final_score = self.compute_final_score(device_id, composite_score, self.alpha)
        
        return final_score

    # =========================================================================
    # Sub-Score Formulas
    # =========================================================================

    def compute_p1_request_rate(self, actual_rate, baseline_rate):
        if actual_rate <= baseline_rate:
            return 100.0
        if baseline_rate == 0:
            return 0.0  # Prevent division by zero if baseline is exactly 0
        return max(0.0, 100.0 - ((actual_rate - baseline_rate) / baseline_rate) * 100.0)

    def compute_p2_endpoint_consistency(self, known_endpoints, total_endpoints):
        if total_endpoints == 0:
            return 100.0
        return (known_endpoints / total_endpoints) * 100.0

    def compute_p3_payload_size(self, actual_size, baseline_size):
        if actual_size <= baseline_size:
            return 100.0
        if baseline_size == 0:
            return 0.0  # Prevent division by zero if baseline is exactly 0
        return max(0.0, 100.0 - ((actual_size - baseline_size) / baseline_size) * 100.0)

    def compute_p4_error_rate(self, error_count, total_requests):
        if total_requests == 0:
            return 100.0
        return max(0.0, 100.0 - (error_count / total_requests) * 100.0)

    # =========================================================================
    # Aggregation & Smoothing
    # =========================================================================

    def compute_composite_score(self, p1, p2, p3, p4):
        return (self.w1 * p1) + (self.w2 * p2) + (self.w3 * p3) + (self.w4 * p4)

    def compute_final_score(self, device_id, composite_score, alpha=0.6):
        # Puts the score through an EWMA temporal smoothing filter
        T_prev = self.trust_scores.get(device_id, 100.0)  # 0-100 scale now
        T_new = (alpha * T_prev) + ((1 - alpha) * composite_score)
        T_new = max(0.0, min(100.0, T_new))
        self.trust_scores[device_id] = T_new
        return T_new
