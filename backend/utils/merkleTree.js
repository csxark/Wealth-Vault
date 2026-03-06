import crypto from 'crypto';

/**
 * MerkleTree Utility (#475)
 * Standard binary Merkle Tree implementation for auditing.
 */
class MerkleTree {
    /**
     * @param {Array<any>} leaves - Array of data items (strings or objects)
     */
    constructor(leaves = []) {
        this.leaves = leaves.map(l => this.hash(l));
        this.tree = [this.leaves];
        this.buildTree();
    }

    hash(data) {
        const str = typeof data === 'object' ? JSON.stringify(data) : String(data);
        return crypto.createHash('sha256').update(str).digest('hex');
    }

    buildTree() {
        let currentLayer = this.leaves;
        if (currentLayer.length === 0) {
            this.tree.push(['0'.repeat(64)]);
            return;
        }
        while (currentLayer.length > 1) {
            const nextLayer = [];
            for (let i = 0; i < currentLayer.length; i += 2) {
                const left = currentLayer[i];
                const right = (i + 1 < currentLayer.length) ? currentLayer[i + 1] : left; // Duplicate last if odd
                nextLayer.push(this.hash(left + right));
            }
            this.tree.push(nextLayer);
            currentLayer = nextLayer;
        }
    }

    getRoot() {
        return this.tree[this.tree.length - 1][0] || null;
    }

    /**
     * Generates an authentication path for a leaf.
     */
    getProof(index) {
        if (index < 0 || index >= this.leaves.length) return null;

        const proof = [];
        let currentIndex = index;
        for (let i = 0; i < this.tree.length - 1; i++) {
            const layer = this.tree[i];
            const isRightNode = currentIndex % 2 !== 0;
            const pairIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;

            if (pairIndex < layer.length) {
                proof.push({
                    position: isRightNode ? 'left' : 'right',
                    data: layer[pairIndex]
                });
            } else {
                // Odd number of nodes, pair with self for the proof
                proof.push({
                    position: 'right',
                    data: layer[currentIndex]
                });
            }
            currentIndex = Math.floor(currentIndex / 2);
        }
        return proof;
    }

    /**
     * Instance verifier
     */
    verifyProof(leaf, proof, root) {
        return MerkleTree.verify(leaf, proof, root);
    }

    /**
     * Static verifier
     */
    static verify(leaf, proof, root) {
        let hash = crypto.createHash('sha256').update(typeof leaf === 'object' ? JSON.stringify(leaf) : String(leaf)).digest('hex');
        for (const element of proof) {
            if (element.position === 'left') {
                hash = crypto.createHash('sha256').update(element.data + hash).digest('hex');
            } else {
                hash = crypto.createHash('sha256').update(hash + element.data).digest('hex');
            }
        }
        return hash === root;
    }
}

export default MerkleTree;
