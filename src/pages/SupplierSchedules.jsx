import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  InlineStack,
  Modal,
  Page,
  Spinner,
  Text,
  Thumbnail,
} from '@shopify/polaris';
import api from '../services/api';

const formatScheduledTime = (schedule) => {
  if (!schedule?.scheduledAt) return 'Not scheduled';
  const timeZone = schedule.metadata?.timeZone;
  try {
    return new Date(schedule.scheduledAt).toLocaleString(undefined, {
      ...(typeof timeZone === 'string' && timeZone ? { timeZone } : {}),
      timeZoneName: 'short',
    });
  } catch {
    return new Date(schedule.scheduledAt).toLocaleString();
  }
};

const getErrorMessage = (error) => error?.message || 'Unable to load assigned schedules.';

export default function SupplierSchedules() {
  const navigate = useNavigate();
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');

  const loadSchedules = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.schedules.list();
      setSchedules(Array.isArray(response.data) ? response.data : []);
    } catch (loadError) {
      if (loadError.status === 401 || loadError.status === 403) {
        localStorage.removeItem('customforge_token');
        localStorage.removeItem('customforge_refresh_token');
        localStorage.removeItem('customforge_user');
        navigate('/login', { replace: true });
      }
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await api.users.logout();
    } catch (logoutError) {
      setError(getErrorMessage(logoutError));
    } finally {
      localStorage.removeItem('customforge_token');
      localStorage.removeItem('customforge_refresh_token');
      localStorage.removeItem('customforge_user');
      window.dispatchEvent(new Event('customforge:auth'));
      navigate('/login', { replace: true });
      setSigningOut(false);
    }
  };

  const handleViewProducts = async (scheduleId) => {
    setDetailsLoading(true);
    setDetailsError('');
    try {
      const response = await api.schedules.getById(scheduleId);
      setSelectedSchedule(response.data);
    } catch (detailsLoadError) {
      setDetailsError(getErrorMessage(detailsLoadError));
    } finally {
      setDetailsLoading(false);
    }
  };

  return (
    <Page
      title="Schedule Mail Service"
      subtitle="Assigned production schedules and automated mail delivery service for suppliers."
      secondaryActions={[
        { content: 'Refresh', onAction: loadSchedules, loading },
        { content: 'Account Profile', onAction: () => navigate('/user') },
        { content: 'Sign out', onAction: handleSignOut, loading: signingOut },
      ]}
    >
      <BlockStack gap="400">
        <Banner tone="info" title="Supplier Portal — Schedule Mail Service">
          This portal is dedicated exclusively to your supplier schedule mail service. Monitor assigned batch schedules and automated email delivery statuses.
        </Banner>
        {error && <Banner tone="critical">{error}</Banner>}
        {loading ? (
          <Box padding="800">
            <InlineStack align="center">
              <Spinner accessibilityLabel="Loading assigned schedules" size="large" />
            </InlineStack>
          </Box>
        ) : schedules.length === 0 ? (
          <Card>
            <Box padding="400">
              <Text as="p" tone="subdued">
                No schedules have been assigned to your supplier account yet.
              </Text>
            </Box>
          </Card>
        ) : (
          <BlockStack gap="300">
            {schedules.map((schedule) => (
              <Card key={schedule.scheduleId || schedule._id}>
                <Box padding="400">
                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="headingSm" as="h2">
                        Schedule {schedule.scheduleId || schedule._id}
                      </Text>
                      <Badge tone={schedule.status === 'CONFIRMED' ? 'success' : 'attention'}>
                        {schedule.status || 'Pending'}
                      </Badge>
                    </InlineStack>
                    <Text as="p">Category: {schedule.category || 'Not specified'}</Text>
                    <Text as="p">
                      Products: {schedule.metadata?.selectedProductCount
                        || (Array.isArray(schedule.orderIds) && schedule.orderIds.length
                          ? schedule.orderIds.length
                          : Array.isArray(schedule.designIds) ? schedule.designIds.length : 0)}
                    </Text>
                    <Text as="p">
                      Scheduled: {formatScheduledTime(schedule)}
                    </Text>
                    <Text as="p">
                      Schedule email: {schedule.supplierEmailStatus === 'sent'
                        ? 'Sent'
                        : schedule.supplierEmailStatus === 'failed'
                          ? 'Delivery failed; contact the merchant'
                          : schedule.supplierEmailStatus === 'sending'
                            ? 'Sending'
                            : schedule.status === 'CONFIRMED' &&
                                schedule.scheduledAt &&
                                new Date(schedule.scheduledAt).getTime() > Date.now()
                              ? 'Queued for scheduled time'
                          : 'Pending'}
                    </Text>
                    {schedule.notes && <Text as="p">Notes: {schedule.notes}</Text>}
                    <Button
                      onClick={() => handleViewProducts(schedule.scheduleId || schedule._id)}
                      loading={detailsLoading}
                    >
                      View products
                    </Button>
                  </BlockStack>
                </Box>
              </Card>
            ))}
          </BlockStack>
        )}
      </BlockStack>
      <Modal
        open={Boolean(selectedSchedule) || detailsLoading || Boolean(detailsError)}
        onClose={() => {
          setSelectedSchedule(null);
          setDetailsError('');
        }}
        title={selectedSchedule
          ? `Products for schedule ${selectedSchedule.scheduleId || ''}`
          : 'Schedule products'}
        primaryAction={{
          content: 'Close',
          onAction: () => {
            setSelectedSchedule(null);
            setDetailsError('');
          },
        }}
      >
        <Modal.Section>
          {detailsError && <Banner tone="critical">{detailsError}</Banner>}
          {detailsLoading ? (
            <InlineStack align="center">
              <Spinner accessibilityLabel="Loading scheduled products" size="large" />
            </InlineStack>
          ) : (
            <BlockStack gap="400">
              {(selectedSchedule?.designs || []).map((design) => (
                <Card key={design.id || design._id}>
                  <Box padding="400">
                    <BlockStack gap="200">
                      <Text variant="headingSm" as="h3">
                        {design.title || design.productId || 'Saved design'}
                      </Text>
                      {design.thumbnailUrl && (
                        <Thumbnail
                          source={design.thumbnailUrl}
                          alt={design.title || 'Saved design artwork'}
                          size="large"
                        />
                      )}
                      <Text as="p" variant="bodySm">Status: {design.status || 'Submitted'}</Text>
                    </BlockStack>
                  </Box>
                </Card>
              ))}
              {(selectedSchedule?.orders || []).map((order) => (
                <Card key={order.orderId}>
                  <Box padding="400">
                    <BlockStack gap="300">
                      <Text variant="headingSm" as="h3">
                        Order {order.metadata?.orderNumber || order.shopifyOrderId || order.orderId}
                      </Text>
                      <Text as="p" variant="bodySm">
                        {order.productType || 'Customized product'} · {order.customerEmail || 'Customer'}
                      </Text>
                      {(order.metadata?.customDesigns || []).map((design, index) => (
                        <BlockStack gap="200" key={`${order.orderId}-${index}`}>
                          <Divider />
                          <Text as="p" variant="bodySm">
                            {design.title || order.productType} · quantity {design.quantity || 1}
                          </Text>
                          {design.imageUrl && (
                            <Thumbnail
                              source={design.imageUrl}
                              alt={`${design.title || 'Customized product'} artwork`}
                              size="large"
                            />
                          )}
                          {Object.entries(design.properties || {}).map(([label, value]) => (
                            value !== '' && value !== null && value !== undefined && (
                              <Text as="p" variant="bodySm" key={label}>
                                {label}: {String(value)}
                              </Text>
                            )
                          ))}
                        </BlockStack>
                      ))}
                    </BlockStack>
                  </Box>
                </Card>
              ))}
              {!selectedSchedule?.orders?.length &&
                !selectedSchedule?.designs?.length &&
                !detailsError && (
                <Text as="p" tone="subdued">No paid custom orders are attached to this schedule.</Text>
              )}
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
