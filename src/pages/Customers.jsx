import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Button,
  DataTable,
  TextField,
  Modal,
  Box,
  Banner,
  Spinner,
  EmptyState,
} from '@shopify/polaris';
import api from '../services/api';

/**
 * Customers Page
 * Real customer list fetched from /api/customers.
 * Starts with no data (0) until customers interact with custom orders.
 */
export default function Customers() {
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location?.pathname?.startsWith('/app') ? '/app' : '';

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res?.data?.items) ? res.data.items : []);
      setCustomers(list);
    } catch (err) {
      console.warn('Could not fetch real customers:', err.message);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, []);


  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customers;
    const q = searchQuery.toLowerCase();
    return customers.filter(
      (c) =>
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q))
    );
  }, [customers, searchQuery]);

  const rows = filteredCustomers.map((cust) => [
    <Text key={cust.id} fontWeight="bold" as="span">{cust.name || 'Anonymous'}</Text>,
    cust.email || 'No email',
    <Badge key={cust.id} tone="info">{`${cust.orders || 0} Orders`}</Badge>,
    <Text key={cust.id} tone="subdued" as="span">{cust.lastOrder || 'None'}</Text>,
    <Button
      key={cust.id}
      size="slim"
      onClick={() => setSelectedCustomer(cust)}
    >
      View Profile
    </Button>,
  ]);

  return (
    <Page
      title="Customers"
      subtitle="Manage your customers and their custom designs."
      secondaryActions={[
        {
          content: 'Refresh',
          onAction: fetchCustomers,
        },
        {
          content: 'Recent Orders',
          onAction: () => navigate(`${basePath}/orders`),
        },
        {
          content: 'Saved Designs',
          onAction: () => navigate(`${basePath}/designs`),
        },
      ]}
    >
      <BlockStack gap="500">
        {error && (
          <Banner tone="warning" onDismiss={() => setError(null)}>
            <Text as="p">Unable to connect to live customer database: {error}</Text>
          </Banner>
        )}

        <Card>
          <BlockStack gap="400">
            {/* Search Header */}
            <InlineStack align="space-between" alignBlock="center" gap="400">
              <Box minWidth="280px">
                <TextField
                  label="Search customers"
                  labelHidden
                  placeholder="Search customers..."
                  value={searchQuery}
                  onChange={setSearchQuery}
                  clearButton
                  onClearButtonClick={() => setSearchQuery('')}
                  autoComplete="off"
                />
              </Box>
              <Button onClick={() => setSearchQuery('')}>Filter</Button>
            </InlineStack>

            {loading ? (
              <Box padding="800">
                <InlineStack align="center">
                  <Spinner accessibilityLabel="Loading customers" size="large" />
                </InlineStack>
              </Box>
            ) : filteredCustomers.length === 0 ? (
              <Box padding="600">
                <BlockStack gap="200" inlineAlign="center">
                  <Text variant="headingMd" as="h3" alignment="center">
                    No customers found (0)
                  </Text>
                  <Text variant="bodyMd" tone="subdued" as="p" alignment="center">
                    {searchQuery
                      ? 'No customers matched your search query.'
                      : 'When customers place custom orders or save designs in your store, their profiles and order histories will appear here.'}
                  </Text>
                </BlockStack>
              </Box>
            ) : (
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                headings={['Name', 'Email', 'Orders', 'Last Order', 'Actions']}
                rows={rows}
              />
            )}
          </BlockStack>
        </Card>
      </BlockStack>

      {/* Customer Detail Profile Modal */}
      {selectedCustomer && (
        <Modal
          open={Boolean(selectedCustomer)}
          onClose={() => setSelectedCustomer(null)}
          title={`Customer: ${selectedCustomer.name || 'Anonymous'}`}
          primaryAction={{
            content: 'View Orders',
            onAction: () => {
              setSelectedCustomer(null);
              navigate(`${basePath}/orders`);
            },
          }}
          secondaryActions={[
            {
              content: 'Close',
              onAction: () => setSelectedCustomer(null),
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                <InlineStack align="space-between">
                  <Text variant="bodyMd" as="p">
                    <strong>Email:</strong> {selectedCustomer.email || 'N/A'}
                  </Text>
                  <Badge tone="magic">{selectedCustomer.tier || 'Customer'}</Badge>
                </InlineStack>
                <Text variant="bodySm" tone="subdued" as="p">
                  Total Spent: {selectedCustomer.spent || '$0.00'} • Total Custom Orders: {selectedCustomer.orders || 0}
                </Text>
              </Box>

              <Text variant="headingSm" as="h3">Associated Saved Designs</Text>
              {Array.isArray(selectedCustomer.designs) && selectedCustomer.designs.length > 0 ? (
                <BlockStack gap="150">
                  {selectedCustomer.designs.map((dName) => (
                    <Card key={dName} background="bg-surface-secondary">
                      <InlineStack align="space-between" alignBlock="center">
                        <Text variant="bodySm" fontWeight="semibold" as="span">{dName}</Text>
                        <Button
                          size="slim"
                          onClick={() => {
                            setSelectedCustomer(null);
                            navigate(`${basePath}/editor?template=${encodeURIComponent(dName)}`);
                          }}
                        >
                          Open in Editor
                        </Button>
                      </InlineStack>
                    </Card>
                  ))}
                </BlockStack>
              ) : (
                <Text variant="bodySm" tone="subdued" as="p">
                  No saved designs found for this customer.
                </Text>
              )}
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}
    </Page>
  );
}
