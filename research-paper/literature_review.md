# Literature Review

## 1. Blockchain-Based Decentralized Identity System (Zaghdoudi et al., 2025)
This paper presents a formal framework for a decentralized identity (DID) system on the blockchain. It establishes device identities through ECDSA signatures and Gateway nodes that manage DID registration securely. A key limitation addressed by our project is the lack of a dynamic trust mechanism after registration.

## 2. Blockchain-Based Distributed Trust Model for Secure IoT Communication (Al-Zaidi et al., 2026)
This paper proposes a continuous trust evaluation system utilizing Exponentially Weighted Moving Averages (EWMA) to rate device behavior continuously. By integrating this model directly with smart contracts, anomalous and malicious activity can be detected and penalized efficiently (e.g. 0.49s detection time).

## Gap Addressed
While Zaghdoudi focuses on identity registration and authentication, Al-Zaidi focuses on continuous trust scoring. By combining these two systems in our implementation, we create a holistic IoT security framework that secures device entry and persistently monitors their behavior on the blockchain.
