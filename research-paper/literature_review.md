# Literature Review

This document summarizes the state-of-the-art research on Dynamic Trust Scoring for IoT Devices on Blockchain, based on a comprehensive review of 23 recent papers.

## Primary Base Papers

### 1. Blockchain-Based Distributed Trust Model for Secure IoT Communication (Al-Zaidi et al., 2026)
* **Objective:** Propose a distributed trust model using an EWMA formula to compute live trust scores without ML algorithms. Explicitly validates that lightweight mathematical models outperform ML for IoT trust evaluation.
* **Research Gap:** No behavioral parameter monitoring (does not track request rate, payload, endpoint consistency, or error rate). No composite trust score formula. No tiered access enforcement or smart contract auto-revocation.
* **Parameters/Metrics:** EWMA trust scoring; detection latency, false positive rate, throughput.
* **Challenges Addressed:** Static trust; latency of ML updates; resource overhead on constrained IoT devices.

### 2. Blockchain-Based Decentralized Identity System: Design and Security Analysis (Zaghdoudi et al., 2025)
* **Objective:** Present a blockchain-based DID system for IoT and D2D networks using gateway nodes as intermediaries for DID registration and authentication via smart contracts. Formal security proofs using Dolev-Yao model.
* **Research Gap:** No behavioral monitoring after onboarding. No trust scoring (identity is binary). No smart contract enforcement tiers. Static post-onboarding state.
* **Parameters/Metrics:** Gateway-based DID registration; onboarding latency, authentication overhead, scalability.
* **Challenges Addressed:** Centralized PKI is a single point of failure; scalability of DID onboarding; interoperability.

## Secondary Literature & Related Work

### 3. A Blockchain Based Decentralized Identity, Access Management, and Trust Evaluation Framework for IoT (Ozturk & Aydos, 2023)
* **Objective:** Combines DID registration, device authentication, and reputation-based trust scoring using smart contracts.
* **Research Gap:** Trust evaluation performed only at onboarding. Trust score relies on historical transaction counts, not live network behavior. No tiered access.

### 4. Trust at the Edge: ABAC-Secured Federated Learning for Smart Home Access Control Using Blockchain (Rahman, Wang & Wei, 2025)
* **Objective:** Integrate ABAC with Federated Learning on Hyperledger Fabric to secure IoT smart homes, preventing model poisoning.
* **Research Gap:** Trust decisions are implicit (FL model) - no explicit trust score formula. Requires ML training infrastructure.

### 5. TrustSec-ChainX: A Pioneering Approach to Enhancing Trust Management and Data Integrity in IoT Healthcare (Pandeeswari & Gobalakrishnan, 2024)
* **Objective:** TrustSec-ChainX with TriBeST trust model (Spatial, Temporal, Behavioural) and PolyChainX multi-blockchain architecture.
* **Research Gap:** Domain-specific (healthcare only). Tracks only 2 behavioral parameters (payload/message frequency). No automatic tiered access enforcement.

### 6. Endorsement-Driven Blockchain SSI Framework for Dynamic IoT Ecosystems (Putra & Putra, 2025)
* **Objective:** Blockchain-based SSI framework allowing individuals to act as credential issuers with automated revocation.
* **Research Gap:** Trust based on credential endorsements only. No composite numerical trust score. No live parameter tracking.

### 7. A Trust-Centric Blockchain-Enabled Fair Cooperative Spectrum Sensing System for IoT Networks (Wang et al., 2025)
* **Objective:** Cooperative Spectrum Sensing system with a non-AI trust evaluation algorithm.
* **Research Gap:** Domain-specific (spectrum sensing). Binary penalty system. No continuous 60-second monitoring cycle or payload/endpoint tracking.

### 8. Trust-Aware Secure Bootstrapping Framework with Lightweight Trusted Computing... (Ordillo-Tibus, 2025)
* **Objective:** Bootstrapping framework integrating lightweight trusted computing and dynamic trust score calculation.
* **Research Gap:** No 4-parameter behavioral formula. No smart contract tiered enforcement (4-tier).

### 9. Towards Tamper-Proof Trust Evaluation of IoT Nodes Leveraging IOTA Ledger (Akli & Chougdali, 2025)
* **Objective:** Trust evaluation for IoT using IOTA Tangle with 60-second trust update intervals.
* **Research Gap:** Uses IOTA Tangle (no smart contracts for auto-revocation). No specific behavioral parameters defined.

### 10. MedAccessX: A Blockchain-Enabled Dynamic Access Control Framework for IoMT Networks (Shi et al., 2025)
* **Objective:** Dynamic access control using ABAC + RBAC integrated in smart contracts.
* **Research Gap:** Access based on static roles/attributes, not live device behavior scores. Healthcare-specific.

### 11. Trust Assessment Methods for Blockchain-Empowered IoT Systems: A Comprehensive Review (Multiple authors, 2026)
* **Objective:** Survey reviewing 122 studies (2018–2025), identifying continuous post-onboarding behavioral trust scoring as unsolved.
* **Research Gap:** Survey paper only. Confirms that continuous 4-parameter behavioral scoring with automated tiered enforcement remains an open problem.

### 12. Dynamic Trust Scoring for IoT Devices on Blockchain (Proposed Work, 2026)
* **Objective:** Build a post-onboarding dynamic trust scoring system where every IoT device gets a live Trust Score (0–100) updated every 60s from 4 behavioral parameters. Smart contracts enforce a 4-tier access system.
* **Research Gap Addressed:** Fills the gap by combining 4-parameter continuous behavioral monitoring + weighted composite formula + automatic smart contract tiered enforcement.

### 13. Blockchain-Based Reputation and Trust Management for Smart Grids, Healthcare, and Transportation: A Review (Raza et al., 2024)
* **Objective:** Systematic review of blockchain-based reputation and trust management.
* **Research Gap:** Confirms existing schemes lack scalability and face high energy consumption. No general IoT behavioral trust system.

### 14. Deep Trust: A Novel Framework for Dynamic Trust and Reputation Management in IoT-Based Networks (Ullah et al., 2024)
* **Objective:** Deep learning framework (RNN/CNN) to learn trust patterns from historical data.
* **Research Gap:** Requires ML training infrastructure. Black-box trust decisions. No blockchain smart contract integration.

### 15. Reputation Evaluation Using Fuzzy Logic for Blockchain-Based Access Control in an IoT Environment (Alqbaishi & Ahmed, 2024)
* **Objective:** Fuzzy-logic reputation system for blockchain IoT access control.
* **Research Gap:** Fuzzy system requires manual tuning. No 4-parameter composite behavioral scoring tied to raw network traffic.

### 16. CAT: A Consensus-Adaptive Trust Management Based on the Group Decision Making in IoVs (Song et al., 2024)
* **Objective:** Trust management integrating Group Decision Making for Internet of Vehicles.
* **Research Gap:** Vehicle-specific. No blockchain smart contract integration. Trust is opinion/reputation-based, not behavioral.

### 17. Secure and Efficient Data Sharing for IoT Based on Blockchain and Reputation Mechanism (Yang et al., 2024)
* **Objective:** Privacy-preserving reputation mechanism using ZKPs and threshold homomorphic encryption for IoT data sharing.
* **Research Gap:** Reputation derived from peer feedback, not continuous device behavioral metrics.

### 18. Blockchain-Enabled Zero Trust Architecture for Privacy-Preserving Cybersecurity in IoT Environments (Aleisa, 2025)
* **Objective:** Quantum-Resilient Blockchain ZKP Privacy Authentication Framework.
* **Research Gap:** Authentication is identity-based, not behavior-based. Trust is binary without tiered access levels.

### 19. Blockchain-Assisted Federated Learning to Secure Critical IoT Infrastructure (Kumar et al., 2026)
* **Objective:** Decentralized framework combining federated learning and blockchain to secure critical IoT.
* **Research Gap:** Focuses on securing FL training rather than continuous post-onboarding behavioral access enforcement.

### 20. Blockchain-Enabled Security Framework for Malicious Node Detection and DDOS Defense in Agricultural IoT (Wu et al., 2026)
* **Objective:** Trustworthy sensor-data storage model for agricultural IoT using DNN with EWC for DDoS defense.
* **Research Gap:** Deep learning suffers from catastrophic forgetting. No general 4-parameter continuous device trust scoring.

### 21. PureChain Closed-Loop Intrusion Detection and Real-Time Recovery for Industrial IoT (Ibrahim et al., 2026)
* **Objective:** Integrates custom lightweight blockchain with XGBoost-based IDS and verifiable recovery.
* **Research Gap:** Treats IDS, logging, and recovery as isolated components, lacking a unified closed-loop framework for immutable logs to trigger mitigation.

### 22. Trust Aware and Explainable Access Control for Internet of Medical Things... (Alashwal et al., 2026)
* **Objective:** X-ABAC for IoMT using Random Forest for dynamic trust evaluation and SHAP for explainable AI.
* **Research Gap:** AI-driven models operate as black boxes lacking transparency. Fully on-chain AI is too costly and slow. Does not rely on continuous 60-second behavioral scoring.

### 23. Lightweight Authentication Protocols for Secure IoT Communication Networks: A Comprehensive Survey... (Ghaleb et al., 2026)
* **Objective:** SLR analyzing 67 lightweight IoT authentication protocols.
* **Research Gap:** Survey paper only. Confirms major open challenges for large-scale resource-constrained IoT deployments.
