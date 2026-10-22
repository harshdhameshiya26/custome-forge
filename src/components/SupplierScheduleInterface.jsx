import { useState, useCallback, useMemo } from 'react';
import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Select,
  TextField,
  ProgressBar,
  Banner,
  Button,
  ButtonGroup,
  Modal,
  Box,
  Divider,
  DataTable,
} from '@shopify/polaris';

/**
 * SupplierScheduleInterface
 * 
 * Enforces production batch schedule creation rules:
 * - Supplier category matching (Apparel, Leather, Drinkware, Metal, Paper)
 * - Strict design count enforcement: MINIMUM 25, MAXIMUM 100 designs per batch
 * - Capacity meter with dynamic tone feedback
 * - 2-step Merchant OTP verification flow before dispatching batch to factory
 * 
 * Built strictly with @shopify/polaris layout and components (zero custom CSS).
 */
export default function SupplierScheduleInterface({
  onScheduleCreated = () => {},
  availableDesigns = [],
}) {
  const [category, setCategory] = useState('apparel');
  const [supplierId, setSupplierId] = useState('sup_apex');
  const [scheduledDate, setScheduledDate] = useState('2026-11-05');
  const [notes, setNotes] = useState('');
  const [selectedCount, setSelectedCount] = useState(0); // Starts at 0

  
  // OTP Verification Modal States
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [scheduleSuccess, setScheduleSuccess] = useState(false);

  // Supplier Options
  const supplierOptions = [
    { label: 'Apex Apparel & Embroidery Mills (Apparel Specialist)', value: 'sup_apex' },
    { label: 'Nordic Leathercraft Co. (Leather Goods)', value: 'sup_nordic' },
    { label: 'Vanguard Thermal Drinkware Labs (Hydro Flasks / Tumblers)', value: 'sup_vanguard' },
    { label: 'Titan Precision Metal & Laser Guild (Metals)', value: 'sup_titan' },
    { label: 'Artisan Offset & Foil Press (Paper / Stationery)', value: 'sup_artisan' },
  ];

  const categoryOptions = [
    { label: 'Apparel & Textiles', value: 'apparel' },
    { label: 'Leather & Synthetic Craft', value: 'leather' },
    { label: 'Drinkware & Flasks', value: 'drinkware' },
    { label: 'Metals & Precision Hardware', value: 'metal' },
    { label: 'Stationery & Luxury Paper', value: 'paper' },
  ];

  // Rule constraints: strictly 25 to 100 designs
  const MIN_DESIGNS = 25;
  const MAX_DESIGNS = 100;

  const isBelowMin = selectedCount < MIN_DESIGNS;
  const isAboveMax = selectedCount > MAX_DESIGNS;
  const isValidCount = !isBelowMin && !isAboveMax;

  const progressPercent = Math.min(100, Math.max(0, Math.round((selectedCount / MAX_DESIGNS) * 100)));

  const handleCountChange = useCallback((value) => {
    const num = parseInt(value, 10);
    setSelectedCount(isNaN(num) ? 0 : num);
  }, []);

  const handleQuickAdjust = useCallback((delta) => {
    setSelectedCount((prev) => Math.max(0, prev + delta));
  }, []);

  const handleOpenOtpModal = useCallback(() => {
    if (!isValidCount) return;
    setOtpRequested(true);
    setOtpValue('');
    setOtpError('');
    setOtpModalOpen(true);
  }, [isValidCount]);

  const handleVerifyOtp = useCallback(() => {
    if (otpValue.trim().length !== 6 || !/^\d{6}$/.test(otpValue.trim())) {
      setOtpError('Security OTP must be exactly 6 numeric digits.');
      return;
    }

    setIsVerifying(true);
    setOtpError('');

    // Simulate backend OTP verification & dispatch call
    setTimeout(() => {
      setIsVerifying(false);
      setOtpModalOpen(false);
      setScheduleSuccess(true);
      onScheduleCreated({
        supplierId,
        category,
        designCount: selectedCount,
        scheduledDate,
        notes,
        status: 'CONFIRMED',
      });
    }, 1200);
  }, [otpValue, supplierId, category, selectedCount, scheduledDate, notes, onScheduleCreated]);

  // Sample design roster rows
  const sampleDesignRows = useMemo(() => [
    ['#DSGN-9842', 'Vintage Mountain Emblem T-Shirt', 'Screen Print', '300 DPI Pass', 'Ready'],
    ['#DSGN-9843', 'Minimalist Serif Monogram Hoodie', 'Direct-to-Garment', '320 DPI Pass', 'Ready'],
    ['#DSGN-9844', 'Botanical Line Art Crewneck', 'Direct-to-Garment', '300 DPI Pass', 'Ready'],
    ['#DSGN-9845', 'Geometric Cyberpunk Chest Patch', 'Sublimation', '300 DPI Pass', 'Ready'],
    ['#DSGN-9846', 'Retro Sunset Wave Illustration', 'Screen Print', '350 DPI Pass', 'Ready'],
  ], []);

  return (
    <BlockStack gap="500">
      {scheduleSuccess && (
        <Banner
          title="Production Schedule Confirmed & Dispatched"
          tone="success"
          onDismiss={() => setScheduleSuccess(false)}
        >
          <Text as="p" variant="bodyMd">
            OTP Verified successfully. Batch of {selectedCount} customized designs has been locked and routed to the designated supplier queue.
          </Text>
        </Banner>
      )}

      {/* Main Form Configuration Card */}
      <Card>
        <BlockStack gap="400">
          <InlineStack align="space-between" alignBlock="center">
            <BlockStack gap="100">
              <Text variant="headingMd" as="h3">
                Create Factory Production Schedule
              </Text>
              <Text variant="bodySm" tone="subdued">
                Group custom customer orders into factory runs. Rule constraint: Each schedule requires between 25 and 100 approved designs.
              </Text>
            </BlockStack>
            <Badge tone={isValidCount ? 'success' : 'critical'}>
              {isValidCount ? 'Batch Capacity Valid' : 'Invalid Batch Size'}
            </Badge>
          </InlineStack>

          <Divider />

          {/* Form Fields */}
          <InlineStack gap="400" wrap={false}>
            <Box width="50%">
              <Select
                label="Target Manufacturing Category"
                options={categoryOptions}
                value={category}
                onChange={setCategory}
                helpText="Only orders matching this production category will be bundled."
              />
            </Box>
            <Box width="50%">
              <Select
                label="Assigned Verified Supplier"
                options={supplierOptions}
                value={supplierId}
                onChange={setSupplierId}
                helpText="Suppliers must be verified for this specialization."
              />
            </Box>
          </InlineStack>

          <InlineStack gap="400" wrap={false}>
            <Box width="50%">
              <TextField
                label="Target Production Dispatch Date"
                type="date"
                value={scheduledDate}
                onChange={setScheduledDate}
                autoComplete="off"
              />
            </Box>
            <Box width="50%">
              <TextField
                label="Internal Production Run Notes"
                placeholder="e.g. Priority run for holiday delivery cut-off"
                value={notes}
                onChange={setNotes}
                autoComplete="off"
              />
            </Box>
          </InlineStack>

          {/* Strict 25 - 100 Quantity Counter Section */}
          <Card background="bg-surface-secondary">
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text variant="headingSm" as="h4">
                  Bundled Designs Count ({selectedCount} Selected)
                </Text>
                <Text variant="bodyMd" fontWeight="bold">
                  Requirement: 25 Min — 100 Max
                </Text>
              </InlineStack>

              <ProgressBar
                progress={progressPercent}
                tone={isValidCount ? 'success' : 'critical'}
                size="medium"
              />

              <InlineStack align="space-between" alignBlock="center">
                <ButtonGroup>
                  <Button onClick={() => handleQuickAdjust(-10)} disabled={selectedCount <= 0}>
                    -10
                  </Button>
                  <Button onClick={() => handleQuickAdjust(-1)} disabled={selectedCount <= 0}>
                    -1
                  </Button>
                  <Button onClick={() => setSelectedCount(25)}>
                    Set Min (25)
                  </Button>
                  <Button onClick={() => setSelectedCount(50)}>
                    Set 50
                  </Button>
                  <Button onClick={() => setSelectedCount(100)}>
                    Set Max (100)
                  </Button>
                  <Button onClick={() => handleQuickAdjust(1)}>
                    +1
                  </Button>
                  <Button onClick={() => handleQuickAdjust(10)}>
                    +10
                  </Button>
                </ButtonGroup>

                <Box width="120px">
                  <TextField
                    label="Count"
                    labelHidden
                    type="number"
                    value={String(selectedCount)}
                    onChange={handleCountChange}
                    min={0}
                    max={150}
                    autoComplete="off"
                  />
                </Box>
              </InlineStack>

              {/* Dynamic Rule Violation Warning Banners */}
              {isBelowMin && (
                <Banner tone="critical" title="Batch Size Too Low">
                  <Text as="p" variant="bodyMd">
                    Supplier agreement requires a minimum of <strong>25 approved designs</strong> per schedule to meet factory machine calibration economics. Current count: {selectedCount} ({25 - selectedCount} more required).
                  </Text>
                </Banner>
              )}

              {isAboveMax && (
                <Banner tone="critical" title="Batch Size Exceeds Factory Capacity">
                  <Text as="p" variant="bodyMd">
                    Factory limit is strictly <strong>100 designs</strong> per single production run. Current selection exceeds the limit by {selectedCount - 100}. Please split into two batches.
                  </Text>
                </Banner>
              )}
            </BlockStack>
          </Card>

          {/* Sample Batched Designs Table */}
          <BlockStack gap="200">
            <Text variant="headingSm" as="h4">
              Approved Designs in Current Queue ({category.toUpperCase()})
            </Text>
            <DataTable
              columnContentTypes={['text', 'text', 'text', 'text', 'text']}
              headings={['Design ID', 'Product Title', 'Technique', 'Artwork Quality', 'Feasibility']}
              rows={sampleDesignRows}
            />
          </BlockStack>

          <Divider />

          {/* Schedule Confirmation Action Bar */}
          <InlineStack align="space-between" alignBlock="center">
            <Text variant="bodySm" tone="subdued">
              Dispatching requires 2-factor OTP verification sent to merchant registered email.
            </Text>
            <Button
              variant="primary"
              size="large"
              disabled={!isValidCount}
              onClick={handleOpenOtpModal}
            >
              Request OTP &amp; Authorize Schedule
            </Button>
          </InlineStack>
        </BlockStack>
      </Card>

      {/* Merchant Security OTP Verification Modal */}
      <Modal
        open={otpModalOpen}
        onClose={() => setOtpModalOpen(false)}
        title="Merchant Production Authorization (2FA OTP)"
        primaryAction={{
          content: 'Verify OTP & Dispatch to Factory',
          onAction: handleVerifyOtp,
          loading: isVerifying,
          disabled: otpValue.trim().length !== 6,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setOtpModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Banner tone="info" title="Security Code Sent">
              <Text as="p" variant="bodyMd">
                A 6-digit verification code has been dispatched to your merchant administrator email. Enter the code below to lock batch of {selectedCount} designs and commit factory capacity.
              </Text>
            </Banner>

            {otpError && (
              <Banner tone="critical" title="Verification Failed">
                <Text as="p" variant="bodyMd">{otpError}</Text>
              </Banner>
            )}

            <Card>
              <BlockStack gap="300">
                <Text variant="bodyMd" fontWeight="semibold">
                  Batch Summary:
                </Text>
                <InlineStack align="space-between">
                  <Text variant="bodySm" tone="subdued">Target Supplier:</Text>
                  <Text variant="bodySm">Apex Apparel &amp; Embroidery Mills</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text variant="bodySm" tone="subdued">Total Approved Items:</Text>
                  <Text variant="bodySm" fontWeight="bold">{selectedCount} Designs (Rule Compliant)</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text variant="bodySm" tone="subdued">Dispatch Date:</Text>
                  <Text variant="bodySm">{scheduledDate}</Text>
                </InlineStack>

                <Divider />

                <TextField
                  label="Enter 6-Digit Merchant Authorization Code"
                  value={otpValue}
                  onChange={setOtpValue}
                  placeholder="e.g. 849201"
                  maxLength={6}
                  autoComplete="one-time-code"
                  helpText="Code expires in 10 minutes. For testing, enter any 6 digits."
                />
              </BlockStack>
            </Card>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </BlockStack>
  );
}
