"""
Implementation of Al-Zaidi et al. IEEE Internet of Things Journal 2026
Algorithm 2: "Trust Score Computation With Smart Contracts and Edge-Based Off-Chain Processing"

Paper citations and exact formulas used:
Equation (1): T_new = (alpha * T_prev) + ((1 - alpha) * (S / (S + F + 1))) - penalty
Equation (3): penalty = beta * M
Equation (4): T_new = max(0.0, min(1.0, T_new))
"""

import datetime
from collections import defaultdict
import requests
import subprocess

class EWMATrustScoreEngine:
    def __init__(self, alpha=0.6, beta=0.3, t_min=0.2, t_max=0.8, update_interval=30,
                 fabric_api_url='http://localhost:3002/api/trust'):
        """
        Store all parameters and initialize state structures.
        """
        self.alpha = alpha
        self.beta = beta
        self.t_min = t_min
        self.t_max = t_max
        self.update_interval = update_interval
        self.fabric_api_url = fabric_api_url

        # Devices start fully trusted
        self.trust_scores = defaultdict(lambda: 1.0)
        
        self.successful_tx = defaultdict(int)
        self.failed_tx = defaultdict(int)
        self.malicious_count = defaultdict(int)
        
        self.update_history = defaultdict(list)

        print("==========================================================================")
        print("EWMATrustScoreEngine Initialized")
        print("Paper: Al-Zaidi et al. IEEE Internet of Things Journal 2026")
        print(f"Parameters: alpha={alpha}, beta={beta}, t_min={t_min}, t_max={t_max}, interval={update_interval}s")
        print("Formula: T_new = (alpha * T_prev) + ((1 - alpha) * (S / (S + F + 1))) - (beta * M)")
        print("Normalized: max(0.0, min(1.0, T_new))")
        print("==========================================================================\n")

    def record_transaction(self, device_id, success=True, is_malicious=False):
        """
        Record a transaction for a device.
        """
        if success and not is_malicious:
            self.successful_tx[device_id] += 1
        else:
            self.failed_tx[device_id] += 1
            
        if is_malicious:
            self.malicious_count[device_id] += 1

    def compute_trust_score(self, device_id):
        """
        Compute trust score using the EXACT formula from the paper.
        
        Equation 3: penalty = self.beta * M
        Equation 1: interaction_ratio = S / (S + F + 1)
                    T_new = (self.alpha * T_prev) + ((1 - self.alpha) * interaction_ratio) - penalty
        Equation 4: T_new = max(0.0, min(1.0, T_new))
        """
        T_prev = self.trust_scores[device_id]
        S = self.successful_tx[device_id]
        F = self.failed_tx[device_id]
        M = self.malicious_count[device_id]
        
        # Equation 3
        penalty = self.beta * M
        
        # Equation 1
        interaction_ratio = S / (S + F + 1)
        T_new = (self.alpha * T_prev) + ((1 - self.alpha) * interaction_ratio) - penalty
        
        # Equation 4
        T_new = max(0.0, min(1.0, T_new))
        
        # Classify
        if T_new < self.t_min:
            status = 'BLACKLISTED'
        elif T_new >= self.t_max:
            status = 'HIGHLY_TRUSTED'
        else:
            status = 'TRUSTED'
            
        self.trust_scores[device_id] = T_new
        
        record = {
            "timestamp": datetime.datetime.now().isoformat(),
            "device_id": device_id,
            "new_score": round(T_new, 4),
            "normalized_score": round(T_new * 100, 4),
            "previous_score": round(T_prev, 4),
            "successful_tx": S,
            "failed_tx": F,
            "malicious_count": M,
            "interaction_ratio": round(interaction_ratio, 4),
            "penalty": round(penalty, 4),
            "status": status,
            "formula_values": {
                "alpha": self.alpha,
                "T_prev": round(T_prev, 4),
                "S": S,
                "F": F,
                "M": M,
                "beta": self.beta,
                "interaction_ratio": round(interaction_ratio, 4),
                "penalty": round(penalty, 4),
                "result": round(T_new, 4)
            }
        }
        
        self.update_history[device_id].append(record)
        
        # Reset counters for next interval
        self.successful_tx[device_id] = 0
        self.failed_tx[device_id] = 0
        self.malicious_count[device_id] = 0
        
        return record

    def send_to_blockchain(self, trust_record):
        """
        Submits trust score immutably to Fabric blockchain via docker CLI container,
        with a secondary/backup call to local Flask API for dashboard UI speed.
        """
        device_id = trust_record['device_id']
        score = trust_record['new_score']
        successful_tx = trust_record['successful_tx']
        failed_tx = trust_record['failed_tx']
        is_malicious = "true" if (trust_record.get('malicious_count', 0) > 0 or trust_record.get('status') == 'BLACKLISTED') else "false"

        # 1. Primary: Immutable On-Chain Transaction via Fabric CLI Container
        cmd = [
            "docker", "exec", "cli", "peer", "chaincode", "invoke",
            "-o", "orderer.iot.example.com:7050",
            "--tls", "--cafile",
            "/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/iot.example.com/orderers/orderer.iot.example.com/msp/tlscacerts/tlsca.iot.example.com-cert.pem",
            "--peerAddresses", "peer0.iot.example.com:7051",
            "--tlsRootCertFiles", "/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/iot.example.com/peers/peer0.iot.example.com/tls/ca.crt",
            "-C", "iot-channel", "-n", "trust-score",
            "-c", f'{{"function":"updateTrustScore","Args":["{device_id}","{round(score,4)}","{successful_tx}","{failed_tx}","{is_malicious}"]}}'
        ]
        
        # Skip blockchain writes if Docker/Fabric containers are unavailable
        if not hasattr(self, '_docker_available'):
            try:
                check = subprocess.run(["docker", "inspect", "--format", "{{.State.Running}}", "cli"],
                                       capture_output=True, text=True, timeout=2)
                self._docker_available = (check.returncode == 0 and "true" in check.stdout.lower())
                if not self._docker_available:
                    print("[BLOCKCHAIN] Fabric 'cli' container not running — skipping on-chain writes (simulation mode)")
            except Exception:
                self._docker_available = False
                print("[BLOCKCHAIN] Docker not found — skipping on-chain writes (simulation mode)")
        
        if self._docker_available:
            try:
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=1)
                if result.returncode != 0:
                    print(f"[BLOCKCHAIN WRITE FAILED] {device_id}: {result.stderr.strip()}")
                else:
                    print(f"[BLOCKCHAIN WRITE SUCCESS] {device_id}: score={score:.4f}")
            except Exception as e:
                print(f"[BLOCKCHAIN WRITE ERROR] {device_id}: {str(e)}")

        # 2. Secondary/Backup: Local Flask API notification (disabled — background
        #    thread updates engine state directly, no HTTP round-trip needed)
        # try:
        #     response = requests.post(self.fabric_api_url + '/update', json=trust_record, timeout=0.5)
        #     response.raise_for_status()
        # except requests.exceptions.RequestException:
        #     pass

    def run_update_cycle(self, device_ids):
        """
        Run the trust score update cycle for a list of devices.
        """
        current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"\n--- Running Update Cycle at {current_time} ---")
        
        blacklisted = []
        for device_id in device_ids:
            record = self.compute_trust_score(device_id)
            
            # Print each device's result with a status icon
            icon = '[OK]' if record['status'] == 'HIGHLY_TRUSTED' else '[WARN]' if record['status'] == 'TRUSTED' else '[FAIL]'
            print(f"  {icon} {device_id}: {record['new_score']:.4f} ({record['status']})")
            
            # Try to send to blockchain
            self.send_to_blockchain(record)
            
            if record['status'] == 'BLACKLISTED':
                blacklisted.append(device_id)
                
        print("--- Cycle Complete ---")
        if blacklisted:
            print(f"BLACKLISTED DEVICES: {', '.join(blacklisted)}")
        print("--------------------------------------\n")

    def get_statistics(self):
        """
        Return summary statistics.
        """
        total_devices = len(self.trust_scores)
        total_updates = sum(len(history) for history in self.update_history.values())
        total_blacklisted = sum(1 for score in self.trust_scores.values() if score < self.t_min)
        
        return {
            "total_devices": total_devices,
            "total_updates": total_updates,
            "total_blacklisted": total_blacklisted,
            "current_scores": {k: round(v, 4) for k, v in self.trust_scores.items()},
            "paper_parameters": {
                "alpha": self.alpha,
                "beta": self.beta,
                "t_min": self.t_min,
                "t_max": self.t_max,
                "update_interval": self.update_interval,
                "formula": "T_new = max(0.0, min(1.0, (alpha * T_prev) + ((1 - alpha) * (S / (S + F + 1))) - (beta * M)))",
                "citation": "Al-Zaidi et al. IEEE Internet of Things Journal 2026, Algorithm 2"
            }
        }
