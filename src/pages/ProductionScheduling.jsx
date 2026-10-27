import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useLocation, useNavigate } from 'react-router';
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  InlineStack,
  Modal,
  Page,
  Select,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import api from '../services/api';

const getLocalDateTime = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

const getProductCount = (order) =>
  (order.customDesigns || []).reduce(
    (count, design) => count + Math.max(1, Number.parseInt(design.quantity, 10) || 1),
    0,
  );

const isScheduleEligible = (order) =>
  ['paid', 'authorized'].includes(String(order.financialStatus || '').toLowerCase()) &&
  (order.customDesigns || []).length > 0;

const getActiveScheduledOrderIds = async () => {
  try {
    const response = await api.schedules.list({ page: 1, limit: 100 });
    const schedules = Array.isArray(response?.data) ? response.data : [];
    return new Set(
      schedules
        .filter((schedule) => ['PENDING', 'CONFIRMED'].includes(schedule.status))
        .flatMap((schedule) => (Array.isArray(schedule.orderIds) ? schedule.orderIds : []))
        .map(String),
    );
  } catch (error) {
    console.warn('Unable to fetch active scheduled order IDs:', error);
    return new Set();
  }
};

const getErrorMessage = (error, fallback) => error?.message || fallback;
const EMPTY_ORDERS = [];

export default function ProductionScheduling({ shopOrders = EMPTY_ORDERS }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [supplierId, setSupplierId] = useState('');
  const [category, setCategory] = useState('');
  const [scheduledAt, setScheduledAt] = useState(getLocalDateTime);
  const [notes, setNotes] = useState('');
  const [schedule, setSchedule] = useState(null);
  const [otp, setOtp] = useState('');
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orderLoadingError, setOrderLoadingError] = useState('');
  const [creating, setCreating] = useState(false);
  const [requestingOtp, setRequestingOtp] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [merchantRoleRequired, setMerchantRoleRequired] = useState(false);
  const [loginRequired, setLoginRequired] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [message, setMessage] = useState('');

  const selectedProductCount = useMemo(
    () =>
      orders
        .filter((order) => selectedOrderIds.includes(order.rawId))
        .reduce((count, order) => count + getProductCount(order), 0),
    [orders, selectedOrderIds],
  );

  const supplierOptions = useMemo(
    () => [
      { label: 'Select a verified supplier', value: '' },
      ...suppliers.map((supplier) => ({
        label: `${supplier.fullName} (${supplier.email})`,
        value: supplier.id || supplier._id,
      })),
    ],
    [suppliers],
  );

  const loadData = useCallback(async () => {
    if (orders.length === 0) {
      setLoading(true);
    }
    setRefreshing(true);
    setError('');
    setMerchantRoleRequired(false);
    setLoginRequired(false);
    setOrderLoadingError('');
    if (!localStorage.getItem('customforge_token')) {
      setLoginRequired(true);
      setError(
        'Sign in to your verified CustomForge merchant account to load suppliers and manage schedules.',
      );
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      let backendOrders = [];
      try {
        const orderResponse = await api.orders.list();
        backendOrders = Array.isArray(orderResponse?.data) ? orderResponse.data : [];
      } catch (orderError) {
        if (shopOrders.length === 0) throw orderError;
        setOrderLoadingError(
          'Some saved order details could not be refreshed. Current Shopify orders are still available.',
        );
      }

      ProductionScheduling.propTypes = {
        shopOrders: PropTypes.arrayOf(PropTypes.object),
      };
      const [supplierResponse, scheduledOrderIds] = await Promise.all([
        api.suppliers.list(),
        getActiveScheduledOrderIds(),
      ]);
      const ordersById = new Map(
        shopOrders.map((order) => [String(order.rawId || order.id), order]),
      );
      for (const order of backendOrders) {
        const key = String(order.rawId || order.id);
        const current = ordersById.get(key);
        ordersById.set(
          key,
          current
            ? {
                ...current,
                ...order,
                customDesigns: (current.customDesigns || []).map((design, index) => ({
                  ...design,
                  ...(order.customDesigns?.[index] || {}),
                })),
              }
            : order,
        );
      }
      setOrders(
        Array.from(ordersById.values()).filter(
            (order) =>
              isScheduleEligible(order) &&
              !scheduledOrderIds.has(String(order.rawId || order.id)),
        ),
      );
      setSuppliers(Array.isArray(supplierResponse?.data) ? supplierResponse.data : []);
    } catch (loadError) {
      const requiredRoles = loadError?.data?.requiredRoles || [];
      const currentRole = String(loadError?.data?.currentRole || '').toLowerCase();
      if (loadError?.status === 401) {
        setLoginRequired(true);
        setError(
          'Sign in to your verified CustomForge merchant account to load suppliers and manage schedules.',
        );
      } else if (
        loadError?.status === 403 &&
        requiredRoles.includes('merchant') &&
        currentRole !== 'merchant'
      ) {
        setMerchantRoleRequired(true);
        setError(
          `This session is signed in as a ${currentRole || 'non-merchant'} account. Supplier scheduling requires a verified merchant account.`,
        );
      } else {
        setError(getErrorMessage(loadError, 'Unable to load paid orders and verified suppliers.'));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [shopOrders, orders.length]);

  const openMerchantSignIn = useCallback(() => {
    navigate(location.pathname.startsWith('/app/') ? '/app/user' : '/user');
  }, [location.pathname, navigate]);

  const switchToMerchantAccount = useCallback(() => {
    localStorage.removeItem('customforge_token');
    localStorage.removeItem('customforge_refresh_token');
    localStorage.removeItem('customforge_user');
    window.dispatchEvent(new Event('customforge:auth'));
    navigate(location.pathname.startsWith('/app/') ? '/app/user' : '/user');
  }, [location.pathname, navigate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function requestConfirmationOtpFor(scheduleId) {
    setRequestingOtp(true);
    setOtpError('');
    try {
      await api.schedules.requestOtp(scheduleId);
      setOtpError('');
    } catch (requestError) {
      setOtpError(getErrorMessage(requestError, 'Unable to send the confirmation code.'));
    } finally {
      setRequestingOtp(false);
    }
  }

  const handleCreateSchedule = async () => {
    setError('');
    setMessage('');
    if (selectedProductCount < 3) {
      setError('Select customized products totaling at least 3 before creating a schedule.');
      return;
    }
    if (!supplierId || !scheduledAt) {
      setError('Choose a verified supplier and a production date.');
      return;
    }

    setCreating(true);
    try {
      const response = await api.schedules.create({
        supplierId,
        category: category.trim() || 'custom-products',
        orderIds: selectedOrderIds,
        scheduledAt: new Date(scheduledAt).toISOString(),
        notes: notes.trim(),
        metadata: {
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        },
      });
      const createdSchedule = response?.data;
      if (!createdSchedule?.scheduleId) {
        throw new Error('The schedule was created without a schedule reference. Refresh and check your schedules.');
      }
      setSchedule(createdSchedule);
      setOtp('');
      setOrders((current) =>
        current.filter((order) => !selectedOrderIds.includes(String(order.rawId || order.id))),
      );
      setSelectedOrderIds([]);
      setOtpModalOpen(true);
      setMessage('Schedule created. A confirmation code is required before products are sent to the supplier.');
      await requestConfirmationOtpFor(createdSchedule.scheduleId);
    } catch (createError) {
      setError(getErrorMessage(createError, 'Unable to create the supplier schedule.'));
    } finally {
      setCreating(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!schedule?.scheduleId || !/^\d{6}$/.test(otp)) return;
    setConfirming(true);
    setOtpError('');
    try {
      const response = await api.schedules.verifyOtp(schedule.scheduleId, otp);
      setOtpModalOpen(false);
      setSchedule(null);
      setSelectedOrderIds([]);
      setMessage(response?.message || 'Schedule confirmed and products dispatched to the supplier.');
      await loadData();
    } catch (verifyError) {
      setOtpError(getErrorMessage(verifyError, 'Unable to confirm this schedule.'));
    } finally {
      setConfirming(false);
    }
  };

  const toggleOrder = (orderId) => {
    setSelectedOrderIds((current) =>
      current.includes(orderId)
        ? current.filter((selectedId) => selectedId !== orderId)
        : [...current, orderId],
    );
  };

  return (
    <Page
      title="Supplier production scheduling"
      subtitle="Schedule paid orders and authorized test orders containing CustomForge designs."
      primaryAction={{ content: 'Refresh', onAction: loadData, loading: refreshing }}
      secondaryActions={[
        {
          content: 'Add supplier',
          onAction: () => {
            const userPath = location.pathname.startsWith('/app/')
              ? '/app/user?addSupplier=1'
              : '/user?addSupplier=1';
            navigate(userPath);
          },
        },
      ]}
    >
      <BlockStack gap="400">
        {error && (
          <Banner
            tone="critical"
            action={
              loginRequired
                ? { content: 'Sign in to CustomForge', onAction: openMerchantSignIn }
                : merchantRoleRequired
                ? { content: 'Sign out and switch account', onAction: switchToMerchantAccount }
                : undefined
            }
          >
            {error}
          </Banner>
        )}
        {orderLoadingError && <Banner tone="warning">{orderLoadingError}</Banner>}
        {message && (
          <Banner tone="success" onDismiss={() => setMessage('')}>
            {message}
          </Banner>
        )}
        {schedule && !otpModalOpen && (
          <Banner
            tone="warning"
            action={{ content: 'Continue confirmation', onAction: () => setOtpModalOpen(true) }}
          >
            Schedule {schedule.scheduleId} is pending confirmation.
          </Banner>
        )}

        <Card>
          <Box padding="400">
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Schedule details</Text>
              <Select
                label="Verified supplier"
                options={supplierOptions}
                value={supplierId}
                onChange={(value) => {
                  setSupplierId(value);
                  const selectedSupplier = suppliers.find(
                    (supplier) => String(supplier.id || supplier._id) === value,
                  );
                  setCategory(selectedSupplier?.supplierCategory || '');
                }}
                disabled={loading || suppliers.length === 0}
              />
              <TextField
                label="Production category"
                value={category}
                onChange={setCategory}
                autoComplete="off"
                helpText="Defaults to the selected supplier's verified specialization."
              />
              <TextField
                label="Scheduled production date and time"
                type="datetime-local"
                value={scheduledAt}
                onChange={setScheduledAt}
                autoComplete="off"
              />
              <TextField
                label="Production notes"
                value={notes}
                onChange={setNotes}
                multiline={3}
                autoComplete="off"
              />
            </BlockStack>
          </Box>
        </Card>

        <Card>
          <Box padding="400">
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center" wrap>
                <Text variant="headingMd" as="h2">Eligible customized products</Text>
                <Badge tone={selectedProductCount >= 3 ? 'success' : 'attention'}>
                  {selectedProductCount} selected · minimum 3
                </Badge>
              </InlineStack>
              {selectedProductCount < 3 && (
                <Banner tone="warning">
                  Select at least 3 customized products. An order with multiple customized units counts by quantity.
                </Banner>
              )}

              {loading && orders.length === 0 ? (
                <InlineStack align="center">
                  <Spinner accessibilityLabel="Loading paid custom orders and suppliers" size="large" />
                </InlineStack>
              ) : orders.length === 0 ? (
                <Text as="p" tone="subdued">
                  No unscheduled paid or authorized orders containing CustomForge designs are available. New eligible orders will appear here after refreshing.
                </Text>
              ) : (
                orders.map((order) => {
                  const orderId = order.rawId;
                  return (
                    <Card key={orderId}>
                      <Box padding="300">
                        <InlineStack align="space-between" blockAlign="center" wrap>
                          <Checkbox
                            label={`${order.id} · ${order.product || 'Custom product'} · ${getProductCount(order)} customized`}
                            checked={selectedOrderIds.includes(orderId)}
                            disabled={!orderId}
                            onChange={() => toggleOrder(orderId)}
                          />
                          <InlineStack gap="200" blockAlign="center">
                            <Text as="span" variant="bodySm" tone="subdued">
                              {order.customerName || order.customer || 'Customer'} · {order.date}
                            </Text>
                          </InlineStack>
                        </InlineStack>
                      </Box>
                    </Card>
                  );
                })
              )}
              <InlineStack align="end">
                <Button
                  variant="primary"
                  onClick={handleCreateSchedule}
                  loading={creating}
                  disabled={
                    loading ||
                    creating ||
                    selectedProductCount < 3 ||
                    !supplierId ||
                    !scheduledAt
                  }
                >
                  Create schedule
                </Button>
              </InlineStack>
            </BlockStack>
          </Box>
        </Card>
      </BlockStack>

      <Modal
        open={otpModalOpen}
        onClose={() => setOtpModalOpen(false)}
        title="Confirm supplier schedule"
        primaryAction={{
          content: 'Confirm and dispatch',
          onAction: handleVerifyOtp,
          loading: confirming,
          disabled: !/^\d{6}$/.test(otp) || confirming,
        }}
        secondaryActions={[
          {
            content: 'Resend code',
            onAction: () => schedule && requestConfirmationOtpFor(schedule.scheduleId),
            loading: requestingOtp,
            disabled: requestingOtp,
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p">
              Enter the 6-digit code sent to your merchant email. The supplier receives this schedule only after successful confirmation.
            </Text>
            {otpError && <Banner tone="critical">{otpError}</Banner>}
            <TextField
              label="Email confirmation code"
              value={otp}
              onChange={(value) => setOtp(value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              autoComplete="one-time-code"
              inputMode="numeric"
            />
            {requestingOtp && (
              <InlineStack gap="200" blockAlign="center">
                <Spinner accessibilityLabel="Sending confirmation code" size="small" />
                <Text as="span" tone="subdued">Sending confirmation code</Text>
              </InlineStack>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
