import { useState, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router';
import {
  AppProvider,
  Frame,
  Navigation,
  TopBar,
  Box,
  Banner,
  Text,
} from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';

// Core Application Views
import Dashboard from './pages/Dashboard';
import CustomizerEditor from './pages/CustomizerEditor';
import ProofApproval from './pages/ProofApproval';
import OrderTracking from './pages/OrderTracking';
import CustomerDesigns from './pages/CustomerDesigns';
import MerchantDashboard from './pages/MerchantDashboard';
import Billing from './pages/Billing';

/**
 * AppLayout
 * 
 * Internal layout rendering the Polaris App Bridge Frame, TopBar,
 * responsive Navigation sidebar, and active route view.
 * Strictly uses @shopify/polaris layout and components (zero custom CSS).
 */
function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const toggleMobileNav = useCallback(() => {
    setMobileNavigationOpen((prev) => !prev);
  }, []);

  const toggleUserMenu = useCallback(() => {
    setUserMenuOpen((prev) => !prev);
  }, []);

  const handleNavClick = useCallback((path) => {
    navigate(path);
    setMobileNavigationOpen(false);
  }, [navigate]);

  // Current active path helper
  const pathname = location.pathname;

  // Polaris TopBar markup
  const topBarMarkup = (
    <TopBar
      showNavigationToggle
      onNavigationToggle={toggleMobileNav}
      userMenu={
        <TopBar.UserMenu
          actions={[
            {
              items: [
                { content: 'Merchant Operations', onAction: () => handleNavClick('/dashboard') },
                { content: 'Subscription & Plans', onAction: () => handleNavClick('/billing') },
              ],
            },
          ]}
          name="CustomForge Merchant"
          detail="Production Admin"
          initials="CF"
          open={userMenuOpen}
          onToggle={toggleUserMenu}
        />
      }
    />
  );

  // Polaris Sidebar Navigation markup
  const navigationMarkup = (
    <Navigation location={pathname}>
      <Navigation.Section
        title="CustomForge Suite"
        items={[
          {
            label: 'Home / Product Catalog',
            selected: pathname === '/' || pathname === '/catalog' || pathname === '/products',
            onClick: () => handleNavClick('/'),
          },
          {
            label: 'Customizer Studio',
            selected: pathname.startsWith('/editor') || pathname.startsWith('/customize'),
            onClick: () => handleNavClick('/editor'),
          },
          {
            label: 'Proof Approvals & History',
            selected: pathname.startsWith('/proofs') || pathname.startsWith('/proof'),
            badge: '19',
            onClick: () => handleNavClick('/proofs'),
          },
          {
            label: 'Custom Order Tracking',
            selected: pathname.startsWith('/orders') || pathname.startsWith('/tracking'),
            onClick: () => handleNavClick('/orders'),
          },
          {
            label: 'Reusable Design Library',
            selected: pathname === '/my-designs' || pathname === '/designs',
            onClick: () => handleNavClick('/my-designs'),
          },
        ]}
      />
      <Navigation.Section
        separator
        title="Merchant Production Hub"
        items={[
          {
            label: 'Merchant Dashboard',
            selected: pathname === '/dashboard' || pathname === '/merchant',
            onClick: () => handleNavClick('/dashboard'),
          },
          {
            label: 'Subscription & Billing',
            selected: pathname === '/billing' || pathname === '/pricing',
            onClick: () => handleNavClick('/billing'),
          },
        ]}
      />
    </Navigation>
  );

  return (
    <Frame
      topBar={topBarMarkup}
      navigation={navigationMarkup}
      showMobileNavigation={mobileNavigationOpen}
      onNavigationDismiss={() => setMobileNavigationOpen(false)}
    >
      <Box padding="400">
        <Routes>
          {/* 1. Home / Catalog */}
          <Route path="/" element={<Dashboard />} />
          <Route path="/catalog" element={<Dashboard />} />
          <Route path="/products" element={<Dashboard />} />

          {/* 2. Interactive Customizer Editor */}
          <Route path="/editor" element={<CustomizerEditor />} />
          <Route path="/editor/:productId" element={<CustomizerEditor />} />
          <Route path="/customize" element={<CustomizerEditor />} />
          <Route path="/customize/:productId" element={<CustomizerEditor />} />

          {/* 3. Proof Approval & Revision History */}
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
              <Box padding="600">
                <Banner title="Page Not Found" tone="critical">
                  <Text as="p" variant="bodyMd">
                    The requested route does not exist. Please use the navigation sidebar to return to the catalog.
                  </Text>
                </Banner>
              </Box>
            }
          />
        </Routes>
      </Box>
    </Frame>
  );
}

/**
 * App
 * 
 * Root application wrapper providing Shopify Polaris AppProvider and React Router.
 */
export default function App() {
  return (
    <AppProvider i18n={enTranslations}>
      <Router>
        <AppLayout />
      </Router>
    </AppProvider>
  );
}