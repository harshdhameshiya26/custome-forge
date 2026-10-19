import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';

// Import Pages
import Dashboard from './pages/Dashboard';
import CustomizerEditor from './pages/CustomizerEditor';
import ProofApproval from './pages/ProofApproval';
import OrderTracking from './pages/OrderTracking';
import CustomerDesigns from './pages/CustomerDesigns';
import MerchantDashboard from './pages/MerchantDashboard';
import Billing from './pages/Billing';

function App() {
  return (
    <Router>
      <s-page full-width>
        {/* Polaris App Navigation Bar */}
        <s-box padding="base" background="subdued" border-block-end-width="base">
          <s-stack direction="inline" align="center" justify="space-between" gap="base">
            <s-heading level="2">CustomForge</s-heading>
            <s-stack direction="inline" gap="base">
              <Link to="/">Catalog</Link>
              <Link to="/editor">Editor</Link>
              <Link to="/proofs">Proofs</Link>
              <Link to="/orders">Orders</Link>
              <Link to="/my-designs">Designs</Link>
              <Link to="/dashboard">Merchant</Link>
              <Link to="/billing">Billing</Link>
            </s-stack>
          </s-stack>
        </s-box>

        {/* Route Definitions Calling All Pages */}
        <s-box padding="base">
          <Routes>
            {/* 1. Product Catalog & Selection */}
            <Route path="/" element={<Dashboard />} />
            <Route path="/catalog" element={<Dashboard />} />
            <Route path="/products" element={<Dashboard />} />

            {/* 2. Interactive Customizer Editor */}
            <Route path="/editor" element={<CustomizerEditor />} />
            <Route path="/editor/:productId" element={<CustomizerEditor />} />
            <Route path="/customize" element={<CustomizerEditor />} />
            <Route path="/customize/:productId" element={<CustomizerEditor />} />

            {/* 3. Proof Approval & Version Comparison */}
            <Route path="/proofs" element={<ProofApproval />} />
            <Route path="/proofs/:proofId" element={<ProofApproval />} />
            <Route path="/proof/:proofId" element={<ProofApproval />} />

            {/* 4. Custom Order Status Timeline */}
            <Route path="/orders" element={<OrderTracking />} />
            <Route path="/orders/:orderId" element={<OrderTracking />} />
            <Route path="/order/:orderId" element={<OrderTracking />} />
            <Route path="/tracking" element={<OrderTracking />} />
            <Route path="/tracking/:orderId" element={<OrderTracking />} />

            {/* 5. Reusable Customer Design Library */}
            <Route path="/my-designs" element={<CustomerDesigns />} />
            <Route path="/designs" element={<CustomerDesigns />} />

            {/* 6. Merchant Dashboard & Production Handoff */}
            <Route path="/dashboard" element={<MerchantDashboard />} />
            <Route path="/merchant" element={<MerchantDashboard />} />
            <Route path="/merchant/dashboard" element={<MerchantDashboard />} />

            {/* 7. Subscription & Billing Plans */}
            <Route path="/billing" element={<Billing />} />
            <Route path="/pricing" element={<Billing />} />
            <Route path="/subscription" element={<Billing />} />

            {/* Fallback Route */}
            <Route
              path="*"
              element={
                <s-section heading="Page Not Found">
                  <s-paragraph>The requested route does not exist.</s-paragraph>
                  <Link to="/">Return to Catalog</Link>
                </s-section>
              }
            />
          </Routes>
        </s-box>
      </s-page>
    </Router>
  );
}

export default App;