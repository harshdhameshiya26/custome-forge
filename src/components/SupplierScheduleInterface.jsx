import { useMemo, useState } from 'react';
import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  InlineStack,
  Modal,
  ProgressBar,
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import api from '../services/api';

const MAX_DESIGNS = 100;
const MIN_DESIGNS = 25;

const getToday = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

export default function SupplierScheduleInterface({
  onScheduleCreated = () => {},
  availableDesigns = [],
  suppliers = [],
}) {
  const [category, setCategory] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [scheduledDate, setScheduledDate] = useState(getToday);
  const [notes, setNotes] = useState('');
  const [selectedDesignIds, setSelectedDesignIds] = useState([]);
  const [scheduleId, setScheduleId] = useState('');
  const [otpValue, setOtpValue] = useState('');
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [requestingOtp, setRequestingOtp] = useState(false);
  const [retryingEmail, setRetryingEmail] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [otpMessage, setOtpMessage] = useState('');
  const [alert, setAlert] = useState(null);
  const [confirmedSchedule, setConfirmedSchedule] = useState(null);

  const categoryOptions = useMemo(() => {
    const categories = [...new Set(
      suppliers
        .map((supplier) => supplier.supplierCategory?.trim())
        .filter(Boolean),
    )].sort((left, right) => left.localeCompare(right));

    return [
      { label: 'Select a supplier category', value: '' },
      ...categories.map((value) => ({ label: value, value })),
    ];
  }, [suppliers]);

  const supplierOptions = useMemo(() => [
    { label: 'Select a registered supplier', value: '' },
    ...suppliers
      .filter(
        (supplier) =>
          supplier.supplierCategory?.trim().toLowerCase() === category.toLowerCase(),
      )
      .map((supplier) => ({
        label: `${supplier.fullName} (${supplier.email})`,
        value: String(supplier._id || supplier.id),
      })),
  ], [category, suppliers]);

  const designOptions = useMemo(() => {
    const uniqueDesigns = new Map();
    for (const order of availableDesigns) {
      const designId = String(order.designId || '').trim();
      if (
        !designId ||
        String(order.status || '').toUpperCase() !== 'APPROVED' ||
        uniqueDesigns.has(designId)
      ) continue;
      uniqueDesigns.set(designId, {
        id: designId,
        label: `${order.id || order.orderId || 'Order'} — ${order.product || 'Custom product'}`,
        status: order.status || 'Unknown',
      });
    }
    return [...uniqueDesigns.values()].slice(0, MAX_DESIGNS);
  }, [availableDesigns]);

  const selectedCount = selectedDesignIds.length;
  const isValidCount = selectedCount >= MIN_DESIGNS && selectedCount <= MAX_DESIGNS;
  const progress = Math.min(100, Math.round((selectedCount / MAX_DESIGNS) * 100));

  const toggleDesign = (designId, checked) => {
    setSelectedDesignIds((current) => {
      if (!checked) return current.filter((id) => id !== designId);
      if (current.length >= MAX_DESIGNS || current.includes(designId)) return current;
      return [...current, designId];
    });
  };

  const requestOtp = async (id) => {
    setRequestingOtp(true);
    setOtpError('');
    setOtpMessage('');
    try {
      const response = await api.schedules.requestOtp(id);
      setOtpMessage(response.message || 'A verification code was sent to your email.');
    } catch (error) {
      setOtpError(error.message || 'Unable to send the verification code.');
    } finally {
      setRequestingOtp(false);
    }
  };

  const handleCreateSchedule = async () => {
    if (!isValidCount || !category || !supplierId || !scheduledDate) return;

    setLoading(true);
    setAlert(null);
    setConfirmedSchedule(null);
    try {
      const response = await api.schedules.create({
        supplierId,
        category,
        designIds: selectedDesignIds,
        scheduledAt: new Date(scheduledDate).toISOString(),
        notes: notes.trim() || undefined,
        metadata: {
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        },
      });
      const newScheduleId = response.data?.scheduleId;
      if (!newScheduleId) {
        throw new Error('Schedule creation did not return a schedule ID.');
      }
      setScheduleId(newScheduleId);
      setOtpValue('');
      setOtpModalOpen(true);
      await requestOtp(newScheduleId);
    } catch (error) {
      setAlert({ tone: 'critical', message: error.message || 'Unable to create the schedule.' });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const otp = otpValue.trim();
    if (!/^\d{6}$/.test(otp)) {
      setOtpError('Enter the 6-digit code sent to your merchant email.');
      return;
    }

    setLoading(true);
    setOtpError('');
    try {
      const response = await api.schedules.verifyOtp(scheduleId, otp);
      const confirmed = {
        ...(response.schedule || {}),
        scheduleId,
        designCount: selectedCount,
        supplierNotification: response.supplierNotification,
      };
      setConfirmedSchedule(confirmed);
      setOtpModalOpen(false);
      setOtpValue('');
      setSelectedDesignIds([]);
      setAlert({
        tone: response.supplierNotification?.scheduled || response.supplierNotification?.inProgress
          ? 'info'
          : response.supplierNotification?.sent === false
            ? 'warning'
            : 'success',
        message: response.message || 'The production schedule was confirmed.',
      });
      onScheduleCreated(confirmed);
    } catch (error) {
      setOtpError(error.message || 'The verification code could not be confirmed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRetryEmail = async () => {
    if (!scheduleId) return;
    setRetryingEmail(true);
    setAlert(null);
    try {
      const response = await api.schedules.sendEmail(scheduleId);
      setConfirmedSchedule((current) => ({
        ...current,
        supplierEmailStatus: response.data?.sent
          ? 'sent'
          : response.data?.inProgress
            ? 'sending'
            : 'pending',
        supplierEmailError: null,
        supplierNotification: response.data,
      }));
      setAlert({
        tone: response.data?.scheduled || response.data?.inProgress
          ? 'info'
          : response.data?.sent
            ? 'success'
            : 'warning',
        message: response.data?.message || response.message || 'Supplier notification status updated.',
      });
    } catch (error) {
      setAlert({
        tone: 'critical',
        message: error.message || 'Unable to send the supplier notification. Please try again.',
      });
    } finally {
      setRetryingEmail(false);
    }
  };

  return (
    <BlockStack gap="400">
      {alert && (
        <Banner tone={alert.tone} onDismiss={() => setAlert(null)}>
          <Text as="p">{alert.message}</Text>
        </Banner>
      )}

      {confirmedSchedule?.supplierNotification?.scheduled && (
        <Banner tone="info" title="Supplier email is scheduled">
          <Text as="p">{confirmedSchedule.supplierNotification.message}</Text>
        </Banner>
      )}

      {confirmedSchedule?.supplierNotification?.inProgress && (
        <Banner tone="info" title="Supplier email is being delivered">
          <Text as="p">{confirmedSchedule.supplierNotification.message}</Text>
        </Banner>
      )}

      {confirmedSchedule?.supplierNotification?.sent === false &&
        !confirmedSchedule?.supplierNotification?.scheduled &&
        !confirmedSchedule?.supplierNotification?.inProgress && (
        <Card>
          <Box padding="400">
            <BlockStack gap="300">
              <Text as="p" tone="critical">
                Schedule is confirmed, but the supplier email was not delivered.
              </Text>
              <Button onClick={handleRetryEmail} loading={retryingEmail}>
                Retry supplier email
              </Button>
            </BlockStack>
          </Box>
        </Card>
      )}

      {scheduleId && !confirmedSchedule && !otpModalOpen && (
        <Banner
          tone="warning"
          title="Schedule awaits verification"
          action={{ content: 'Continue verification', onAction: () => setOtpModalOpen(true) }}
        >
          <Text as="p">Schedule {scheduleId} has not been confirmed yet.</Text>
        </Banner>
      )}

      <Card>
        <Box padding="400">
          <BlockStack gap="400">
            <BlockStack gap="100">
              <Text variant="headingMd" as="h2">Create supplier schedule</Text>
              <Text as="p" tone="subdued">
                Select 25 to 100 saved designs. Confirming the schedule emails its details to the assigned supplier.
              </Text>
            </BlockStack>

            <Divider />

            <InlineStack gap="400" wrap>
              <Box minWidth="250px">
                <Select
                  label="Supplier category"
                  options={categoryOptions}
                  value={category}
                  onChange={(value) => {
                    setCategory(value);
                    setSupplierId('');
                  }}
                  disabled={suppliers.length === 0}
                />
              </Box>
              <Box minWidth="250px">
                <Select
                  label="Registered supplier"
                  options={supplierOptions}
                  value={supplierId}
                  onChange={setSupplierId}
                  disabled={!category}
                />
              </Box>
              <Box minWidth="200px">
                <TextField
                  label="Scheduled production date and time"
                  type="datetime-local"
                  value={scheduledDate}
                  onChange={setScheduledDate}
                  autoComplete="off"
                />
              </Box>
            </InlineStack>

            <TextField
              label="Notes for supplier (optional)"
              value={notes}
              onChange={setNotes}
              multiline={2}
              maxLength={1000}
              autoComplete="off"
            />

            <BlockStack gap="200">
              <InlineStack align="space-between">
                <Text variant="headingSm" as="h3">Approved designs ({selectedCount} selected)</Text>
                <Text as="p" tone="subdued">Minimum 25, maximum 100</Text>
              </InlineStack>
              <ProgressBar
                progress={progress}
                tone={isValidCount ? 'success' : 'highlight'}
                size="small"
              />
              {designOptions.length === 0 ? (
                <Text as="p" tone="subdued">
                  No saved designs are available in the current order list.
                </Text>
              ) : (
                <BlockStack gap="200">
                  {designOptions.map((design) => (
                    <Checkbox
                      key={design.id}
                      label={design.label}
                      helpText={`Design ID: ${design.id} · Order status: ${design.status}`}
                      checked={selectedDesignIds.includes(design.id)}
                      disabled={
                        selectedCount >= MAX_DESIGNS && !selectedDesignIds.includes(design.id)
                      }
                      onChange={(checked) => toggleDesign(design.id, checked)}
                    />
                  ))}
                </BlockStack>
              )}
            </BlockStack>

            <Button
              variant="primary"
              onClick={handleCreateSchedule}
              loading={loading}
              disabled={
                !isValidCount ||
                !category ||
                !supplierId ||
                !scheduledDate ||
                !designOptions.length ||
                (scheduleId && !confirmedSchedule)
              }
            >
              Create schedule and request verification code
            </Button>
          </BlockStack>
        </Box>
      </Card>

      <Modal
        open={otpModalOpen}
        onClose={() => setOtpModalOpen(false)}
        title="Confirm supplier schedule"
        primaryAction={{
          content: 'Verify and confirm schedule',
          onAction: handleVerifyOtp,
          loading,
          disabled: !scheduleId || !/^\d{6}$/.test(otpValue.trim()),
        }}
        secondaryActions={[
          { content: 'Cancel', onAction: () => setOtpModalOpen(false) },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="p">
              Enter the 6-digit code sent to your merchant account email. The supplier is notified only after verification.
            </Text>
            {otpError && <Banner tone="critical">{otpError}</Banner>}
            {otpMessage && <Banner tone="success">{otpMessage}</Banner>}
            <TextField
              label="Email verification code"
              value={otpValue}
              onChange={setOtpValue}
              maxLength={6}
              autoComplete="one-time-code"
              inputMode="numeric"
            />
            <Button onClick={() => requestOtp(scheduleId)} loading={requestingOtp} disabled={!scheduleId}>
              Send code again
            </Button>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </BlockStack>
  );
}
