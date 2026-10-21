import { useState, useCallback } from 'react';
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
  ButtonGroup,
  Banner,
  Modal,
  TextField,
  Divider,
  Box,
  Tabs,
  List,
} from '@shopify/polaris';
import ArtworkValidatorModal from '../components/ArtworkValidatorModal';
import FeasibilityWarning from '../components/FeasibilityWarning';

/**
 * ProofApproval
 * 
 * Production Proof Approval & Revision History View:
 * - Proof status header & metadata
 * - Multi-version comparison (V1, V2, V3) with changelog notes
 * - Customer & Merchant conversation thread with role badges
 * - Final 2FA / OTP verification lock box for production release
 * - Revision request dialog
 * 
 * Strictly uses @shopify/polaris components and layout props (no custom CSS).
 */
export default function ProofApproval() {
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location?.pathname?.startsWith('/app') ? '/app' : '';

  const [selectedVersionIndex, setSelectedVersionIndex] = useState(1); // Default to V2 (Latest)
  const [proofStatus, setProofStatus] = useState('PENDING_APPROVAL'); // PENDING_APPROVAL, APPROVED, REVISION_REQUESTED
  const [validatorOpen, setValidatorOpen] = useState(false);
  const [revisionModalOpen, setRevisionModalOpen] = useState(false);
  const [revisionFeedback, setRevisionFeedback] = useState('');
  
  // OTP Approval Box State
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [bannerAlert, setBannerAlert] = useState(null);

  // Comments Thread State
  const [comments, setComments] = useState([
    {
      id: 'c1',
      author: 'Sarah Jenkins (Customer)',
      role: 'customer',
      time: 'Yesterday at 3:15 PM',
      content: 'Could we move the crest emblem down by 1 inch so it does not collide with the zipper collar?',
    },
    {
      id: 'c2',
      author: 'Marcus Vance (Production Lead)',
      role: 'merchant',
      time: 'Yesterday at 4:40 PM',
      content: 'Understood Sarah! We re-aligned the embroidery coordinate 25mm lower and regenerated V2 proof for your review.',
    },
  ]);
  const [newCommentText, setNewCommentText] = useState('');

  // Proof Versions Data
  const versions = [
    {
      id: 'v1',
      versionName: 'Version 1 (Initial Submission)',
      createdAt: 'Oct 18, 2026, 10:20 AM',
      author: 'Automated Customizer AI',
      dpi: 180,
      changes: ['Initial vector generation from customer upload', 'RGB to CMYK preliminary mapping'],
      status: 'Superceded',
    },
    {
      id: 'v2',
      versionName: 'Version 2 (Current Production Ready)',
      createdAt: 'Oct 19, 2026, 04:35 PM',
      author: 'Marcus Vance (CustomForge Operator)',
      dpi: 320,
      changes: [
        'Shifted embroidery baseline -25mm below collar seam',
        'Enhanced stitch density for serif lettering',
        'Artwork upscaled to 320 DPI and proofed against laser calibration curve',
      ],
      status: 'Ready for Sign-off',
    },
  ];

  const currentVersion = versions[selectedVersionIndex];

  const versionTabs = versions.map((v, idx) => ({
    id: `tab-${v.id}`,
    content: `${v.versionName.split(' ')[0]} ${v.versionName.split(' ')[1]} (${idx === 1 ? 'Current' : 'Archive'})`,
  }));

  const handlePostComment = useCallback(() => {
    if (!newCommentText.trim()) return;
    const item = {
      id: `c_${Date.now()}`,
      author: 'Merchant Administrator',
      role: 'merchant',
      time: 'Just now',
      content: newCommentText.trim(),
    };
    setComments((prev) => [...prev, item]);
    setNewCommentText('');
  }, [newCommentText]);

  const handleConfirmApproval = useCallback(() => {
    if (otpCode.trim().length !== 6) return;
    setIsApproving(true);
    setTimeout(() => {
      setIsApproving(false);
      setOtpModalOpen(false);
      setProofStatus('APPROVED');
      setBannerAlert({
        tone: 'success',
        title: 'Digital Proof Successfully Approved & Locked',
        message: 'Order #ORD-8491 proof has been signed off with OTP verification and dispatched to factory queue.',
      });
    }, 1000);
  }, [otpCode]);

  const handleSubmitRevision = useCallback(() => {
    if (!revisionFeedback.trim()) return;
    setProofStatus('REVISION_REQUESTED');
    setRevisionModalOpen(false);
    setBannerAlert({
      tone: 'info',
      title: 'Revision Request Transmitted to Pre-press Team',
      message: 'Designers have received the annotations and will upload Version 3 within 4 business hours.',
    });
    setComments((prev) => [
      ...prev,
      {
        id: `c_${Date.now()}`,
        author: 'Merchant Administrator',
        role: 'merchant',
        time: 'Just now',
        content: `Revision Requested: ${revisionFeedback}`,
      },
    ]);
    setRevisionFeedback('');
  }, [revisionFeedback]);

  return (
    <Page
      title="Digital Proof Approval & Revision History"
      subtitle="Order #ORD-8491 — Heavyweight French Terry Hoodie"
      backAction={{ content: 'Back to Orders', onAction: () => navigate(`${basePath}/orders`) }}
      titleMetadata={
        <Badge
          tone={
            proofStatus === 'APPROVED'
              ? 'success'
              : proofStatus === 'REVISION_REQUESTED'
              ? 'attention'
              : 'warning'
          }
        >
          {proofStatus === 'APPROVED'
            ? 'Proof Approved'
            : proofStatus === 'REVISION_REQUESTED'
            ? 'Revision in Progress'
            : 'Pending Client Sign-off'}
        </Badge>
      }
    >
      <BlockStack gap="500">
        {bannerAlert && (
          <Banner
            title={bannerAlert.title}
            tone={bannerAlert.tone}
            onDismiss={() => setBannerAlert(null)}
          >
            <Text as="p" variant="bodyMd">{bannerAlert.message}</Text>
          </Banner>
        )}

        <Layout>
          {/* Main Visual Proof & Version Comparison Column */}
          <Layout.Section>
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" alignBlock="center">
                    <Text variant="headingMd" as="h3">
                      Proof Canvas &amp; Version Comparison
                    </Text>
                    <ButtonGroup>
                      <Button onClick={() => setValidatorOpen(true)}>
                        Inspect Artwork Quality
                      </Button>
                      <Button
                        variant="plain"
                        onClick={() => setSelectedVersionIndex(selectedVersionIndex === 0 ? 1 : 0)}
                      >
                        Toggle Compare
                      </Button>
                    </ButtonGroup>
                  </InlineStack>

                  <Tabs
                    tabs={versionTabs}
                    selected={selectedVersionIndex}
                    onSelect={setSelectedVersionIndex}
                  />

                  {/* Proof Graphic Box (Pure Polaris layout) */}
                  <Card background="bg-surface-secondary">
                    <BlockStack gap="300" align="center">
                      <Box
                        padding="800"
                        background="bg-surface"
                        borderRadius="200"
                        borderWidth="025"
                        borderColor="border"
                      >
                        <BlockStack gap="200" align="center">
                          <Text variant="headingLg" as="p" tone="magic">
                            [ CUSTOM EMBROIDERY MOCKUP ]
                          </Text>
                          <Text variant="bodySm" tone="subdued">
                            Product: Heavyweight French Terry Hoodie (Black, XL)
                          </Text>
                          <Text variant="bodySm" tone="subdued">
                            Technique: High-Density Madeira Thread Embroidery (8,400 Stitches)
                          </Text>
                          <Badge tone="success">
                            {currentVersion.dpi} DPI Print Ready
                          </Badge>
                        </BlockStack>
                      </Box>
                    </BlockStack>
                  </Card>

                  {/* Version Changelog Breakdown */}
                  <Card>
                    <BlockStack gap="200">
                      <InlineStack align="space-between">
                        <Text variant="headingSm" as="h4">
                          {currentVersion.versionName}
                        </Text>
                        <Text variant="bodySm" tone="subdued">
                          {currentVersion.createdAt}
                        </Text>
                      </InlineStack>
                      <Text variant="bodySm" tone="subdued">
                        Generated by: {currentVersion.author}
                      </Text>
                      <Divider />
                      <Text variant="bodySm" fontWeight="semibold">
                        Version Modifications:
                      </Text>
                      <List type="bullet">
                        {currentVersion.changes.map((change, i) => (
                          <List.Item key={i}>{change}</List.Item>
                        ))}
                      </List>
                    </BlockStack>
                  </Card>
                </BlockStack>
              </Card>

              {/* Discussion & Revision Comments Thread */}
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h3">
                    Customer &amp; Merchant Proof Collaboration Thread
                  </Text>
                  <Divider />

                  <BlockStack gap="300">
                    {comments.map((msg) => (
                      <Card key={msg.id} background={msg.role === 'customer' ? 'bg-surface-secondary' : 'bg-surface'}>
                        <BlockStack gap="100">
                          <InlineStack align="space-between">
                            <InlineStack gap="200" align="center">
                              <Text variant="bodyMd" fontWeight="bold">
                                {msg.author}
                              </Text>
                              <Badge tone={msg.role === 'customer' ? 'info' : 'success'} size="small">
                                {msg.role.toUpperCase()}
                              </Badge>
                            </InlineStack>
                            <Text variant="bodySm" tone="subdued">
                              {msg.time}
                            </Text>
                          </InlineStack>
                          <Text variant="bodyMd">{msg.content}</Text>
                        </BlockStack>
                      </Card>
                    ))}
                  </BlockStack>

                  <BlockStack gap="200">
                    <TextField
                      label="Add Comment or Revision Instruction"
                      value={newCommentText}
                      onChange={setNewCommentText}
                      multiline={3}
                      placeholder="Type a message or adjustment note for the client..."
                      autoComplete="off"
                    />
                    <InlineStack align="end">
                      <Button onClick={handlePostComment} disabled={!newCommentText.trim()}>
                        Post Message
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          {/* Right Action Sidebar (Approval & Production Lock) */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              {/* Approval Action Card */}
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h3">
                    Proof Sign-Off Action
                  </Text>
                  <Text variant="bodySm" tone="subdued">
                    Authorizing this proof commits the artwork file into production. Changes cannot be made once factory cutting commences.
                  </Text>

                  <Divider />

                  {proofStatus === 'APPROVED' ? (
                    <Banner tone="success" title="Production Authorization Complete">
                      <Text as="p" variant="bodyMd">
                        Digital sign-off secured. Batch has been queued for embroidery run #EMB-290.
                      </Text>
                    </Banner>
                  ) : (
                    <BlockStack gap="300">
                      <Button
                        variant="primary"
                        size="large"
                        fullWidth
                        onClick={() => setOtpModalOpen(true)}
                      >
                        Authorize &amp; Lock Proof (OTP)
                      </Button>
                      <Button
                        fullWidth
                        onClick={() => setRevisionModalOpen(true)}
                      >
                        Request Another Revision
                      </Button>
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>

              {/* Manufacturing Constraints Notice */}
              <FeasibilityWarning
                violations={[
                  {
                    id: 'fw_emb',
                    parameter: 'Embroidery Needle Clearance',
                    severity: 'warning',
                    message: 'Min needle spacing is 0.8mm; current V2 file satisfies this criteria.',
                    recommendation: 'Safe for commercial brother high-speed head.',
                  },
                ]}
                blocking={false}
              />
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>

      {/* OTP Verification Modal */}
      <Modal
        open={otpModalOpen}
        onClose={() => setOtpModalOpen(false)}
        title="Digital Proof Approval Sign-Off"
        primaryAction={{
          content: 'Verify OTP & Release to Factory',
          onAction: handleConfirmApproval,
          loading: isApproving,
          disabled: otpCode.trim().length !== 6,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setOtpModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Banner tone="info" title="Final Production Release Authorization">
              <Text as="p" variant="bodyMd">
                Enter the 6-digit confirmation security code sent to merchant mobile/email to execute the digital signature and lock this design.
              </Text>
            </Banner>
            <TextField
              label="6-Digit Verification PIN"
              value={otpCode}
              onChange={setOtpCode}
              placeholder="e.g. 529103"
              maxLength={6}
              autoComplete="one-time-code"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Revision Request Modal */}
      <Modal
        open={revisionModalOpen}
        onClose={() => setRevisionModalOpen(false)}
        title="Request Design Proof Revision"
        primaryAction={{
          content: 'Transmit Revision Request',
          onAction: handleSubmitRevision,
          disabled: !revisionFeedback.trim(),
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setRevisionModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text variant="bodyMd">
              Describe the required adjustments clearly so the design team can deliver Version 3 accurately.
            </Text>
            <TextField
              label="Revision Description"
              value={revisionFeedback}
              onChange={setRevisionFeedback}
              multiline={4}
              placeholder="e.g., Please shift the text 10mm right and change color to Navy Blue..."
              autoComplete="off"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Artwork Inspector Modal */}
      <ArtworkValidatorModal
        open={validatorOpen}
        onClose={() => setValidatorOpen(false)}
        onConfirm={() => setValidatorOpen(false)}
        artworkData={{
          fileName: 'hoodie_chest_embroidery_v2.ai',
          fileSize: '12.4 MB',
          dimensions: '3600 x 4200 px',
          dpi: 320,
          minRecommendedDpi: 300,
          colorMode: 'CMYK (U.S. Web Coated SWOP v2)',
          targetColorMode: 'CMYK',
          safeZoneMargin: '6.5 mm (Safe)',
          hasTransparency: true,
        }}
      />
    </Page>
  );
}
