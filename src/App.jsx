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
  Card,
  Button,
  BlockStack,
} from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';

// Core Application Views matching Image 1
import Dashboard from './pages/Dashboard';
import CustomizerEditor from './pages/CustomizerEditor';
import CustomerDesigns from './pages/CustomerDesigns';
import ProofApproval from './pages/ProofApproval';
import OrderTracking from './pages/OrderTracking';
import ProductionQueue from './pages/ProductionQueue';
import DesignTemplates from './pages/DesignTemplates';
import Customers from './pages/Customers';
import Settings from './pages/Settings';
import Billing from './pages/Billing';

/**
 * AppLayout
 *
 * Implements the layout from Image 1:
 * - Polaris TopBar with "My Shopify Store" and user avatar initials "S" (Sahdev)
 * - Sidebar Navigation:
 *   1. Dashboard
 *   2. Orders
 *   3. Designs
 *   4. Templates
 *   5. Customers
 *   6. Production
 *   7. Settings
 * - Sidebar footer card: "Upgrade Plan - Unlock more features for your store."
 *
 * Strictly built with @shopify/polaris components (zero custom CSS).
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

  const pathname = location.pathname;

  // Polaris TopBar matching Image 1 ("My Shopify Store" dropdown and "Sahdev" avatar)
  const topBarMarkup = (
    <TopBar
      showNavigationToggle
      onNavigationToggle={toggleMobileNav}
      userMenu={
        <TopBar.UserMenu
          actions={[
            {
              items: [
                { content: 'Dashboard', onAction: () => handleNavClick('/') },
                { content: 'App Settings', onAction: () => handleNavClick('/settings') },
                { content: 'Upgrade Plan', onAction: () => handleNavClick('/billing') },
              ],
            },
          ]}
          name="Sahdev"
          detail="My Shopify Store"
          initials="S"
          open={userMenuOpen}
          onToggle={toggleUserMenu}
        />
      }
    />
  );

  // Polaris Sidebar Navigation matching Image 1 exactly
  const navigationMarkup = (
    <Navigation location={pathname}>
      <Navigation.Section
        title="CustomForge"
        items={[
          {
            label: 'Dashboard',
            selected: pathname === '/' || pathname === '/dashboard',
            onClick: () => handleNavClick('/'),
          },
          {
            label: 'Orders',
            selected: pathname.startsWith('/orders') || pathname.startsWith('/tracking'),
            onClick: () => handleNavClick('/orders'),
          },
          {
            label: 'Designs',
            selected: pathname.startsWith('/designs') || pathname.startsWith('/my-designs'),
            onClick: () => handleNavClick('/designs'),
          },
          {
            label: 'Templates',
            selected: pathname.startsWith('/templates'),
            onClick: () => handleNavClick('/templates'),
          },
          {
            label: 'Customers',
            selected: pathname.startsWith('/customers'),
            onClick: () => handleNavClick('/customers'),
          },
          {
            label: 'Production',
            selected: pathname.startsWith('/production'),
            onClick: () => handleNavClick('/production'),
          },
          {
            label: 'Settings',
            selected: pathname.startsWith('/settings'),
            onClick: () => handleNavClick('/settings'),
          },
        ]}
      />

      <Navigation.Section
        separator
        title="Customizer & Proofs"
        items={[
          {
            label: 'Customizer Studio',
            selected: pathname.startsWith('/editor') || pathname.startsWith('/customize'),
            onClick: () => handleNavClick('/editor'),
          },
          {
            label: 'Design Proof & Approval',
            selected: pathname.startsWith('/proofs') || pathname.startsWith('/proof'),
            onClick: () => handleNavClick('/proofs'),
          },
        ]}
      />

      {/* Promotion Footer Banner inside sidebar */}
      <Box padding="300">
        <Card background="bg-surface-secondary">
          <BlockStack gap="200">
            <Text variant="headingSm" as="h4">Upgrade Plan</Text>
            <Text variant="bodyXs" tone="subdued" as="p">
              Unlock more features for your store.
            </Text>
            <Button
              variant="primary"
              size="slim"
              onClick={() => handleNavClick('/billing')}
            >
              Upgrade Plan
            </Button>
          </BlockStack>
        </Card>
      </Box>
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
          {/* 1. Dashboard (Screen 1) */}
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />

          {/* 2. Customizer Studio (Screen 2) */}
          <Route path="/editor" element={<CustomizerEditor />} />
          <Route path="/editor/:productId" element={<CustomizerEditor />} />
          <Route path="/customize" element={<CustomizerEditor />} />

          {/* 3. My Saved Designs (Screen 3) */}
          <Route path="/designs" element={<CustomerDesigns />} />
          <Route path="/my-designs" element={<CustomerDesigns />} />

          {/* 4. Design Proof & Approval (Screen 4) */}
          <Route path="/proofs" element={<ProofApproval />} />
          <Route path="/proofs/:proofId" element={<ProofApproval />} />
          <Route path="/proof/:proofId" element={<ProofApproval />} />

          {/* 5. Custom Order Status Timeline (Screen 5) */}
          <Route path="/orders" element={<OrderTracking />} />
          <Route path="/orders/:orderId" element={<OrderTracking />} />
          <Route path="/tracking" element={<OrderTracking />} />

          {/* 6. Production Queue (Screen 6) */}
          <Route path="/production" element={<ProductionQueue />} />

          {/* 7. Design Templates (Screen 7) */}
          <Route path="/templates" element={<DesignTemplates />} />

          {/* 8. Customers Directory (Screen 8) */}
          <Route path="/customers" element={<Customers />} />

          {/* 9. Settings & Production Handoff Rules (Screen 9) */}
          <Route path="/settings" element={<Settings />} />

          {/* 10. Billing & Subscription */}
          <Route path="/billing" element={<Billing />} />

          {/* Fallback */}
          <Route
            path="*"
            element={
              <Box padding="600">
                <Banner title="Page Not Found" tone="critical">
                  <Text as="p" variant="bodyMd">
                    The requested route does not exist. Please use the navigation sidebar to return to the dashboard.
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

export default function App() {
  return (
    <AppProvider i18n={enTranslations}>
      <Router>
        <AppLayout />
      </Router>
    </AppProvider>
  );
}