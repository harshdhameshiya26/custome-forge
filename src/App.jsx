import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

// Import Pages
import Dashboard from './pages/Dashboard';
import CustomizerEditor from './pages/CustomizerEditor';
import ProofApproval from './pages/ProofApproval';
import OrderTracking from './pages/OrderTracking';
import CustomerDesigns from './pages/CustomerDesigns';
import MerchantDashboard from './pages/MerchantDashboard';

function App() {
  return (
    <Router>
      <div className="customforge-app">
        <Routes>
          {/* --- Customer-Facing Workflows --- */}
          
          {/* 1. Product Catalog & Selection */}
          <Route path="/" element={<Dashboard />} />

          {/* 2. Interactive Customizer Editor (Handles: Save/Reset, Artwork Quality & Feasibility Checkers) */}
          <Route path="/editor/:productId" element={<CustomizerEditor />} />

          {/* 3. Proof Approval & Version Comparison (Handles: Revisions, Version diffs, Comments) */}
          <Route path="/proofs/:proofId" element={<ProofApproval />} />

          {/* 4. Custom Order Status Timeline */}
          <Route path="/orders/:orderId" element={<OrderTracking />} />

          {/* 5. Reusable Customer Design Library (Saved logos/monograms) */}
          <Route path="/my-designs" element={<CustomerDesigns />} />


          {/* --- Merchant Embedded App Workflows --- */}
          
          {/* 6. Merchant Dashboard (Handles: Production queues, Handoff rules, Print-ready file generation) */}
          <Route path="/dashboard" element={<MerchantDashboard />} />

          {/* Fallback Route */}
          <Route path="*" element={<div className="p-8 text-center">Page Not Found</div>} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;