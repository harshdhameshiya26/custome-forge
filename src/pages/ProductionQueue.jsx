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
  Tabs,
  Modal,
  Select,
  Banner,
  Box,
  Spinner,
} from '@shopify/polaris';
import api from '../services/api';

const TEAMS = [
  { label: 'Print Team', value: 'Print Team' },
  { label: 'DTG Team', value: 'DTG Team' },
  { label: 'UV Print Team', value: 'UV Print Team' },
  { label: 'Embroidery Team', value: 'Embroidery Team' },
  { label: 'QC Team', value: 'QC Team' },
];

const STATUS_OPTIONS = [
  { label: 'Pending', value: 'Pending' },
  { label: 'In Production', value: 'In Production' },
  { label: 'Quality Check', value: 'Quality Check' },
  { label: 'Completed', value: 'Completed' },
];

/**
 * ProductionQueue
 * Real production workflow manager fetching from /api/production.
 * Starts with no data (0) until custom orders are routed.
 */
export default function ProductionQueue() {
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location?.pathname?.startsWith('/app') ? '/app' : '';

  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);
  const [selectedJob, setSelectedJob] = useState(null);
  const [editTeam, setEditTeam] = useState('DTG Team');
  const [editStatus, setEditStatus] = useState('Pending');
  const [bannerAlert, setBannerAlert] = useState(null);

  const fetchQueue = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.production.list();
      const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res?.data?.items) ? res.data.items : []);
      setQueue(list);

    } catch (err) {
      console.warn('Could not fetch real production queue:', err.message);
      setQueue([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const pendingCount = queue.filter((i) => i.status === 'Pending').length;
  const inProdCount = queue.filter((i) => i.status === 'In Production').length;
  const qcCount = queue.filter((i) => i.status === 'Quality Check').length;
  const completedCount = queue.filter((i) => i.status === 'Completed').length;

  const tabs = [
    { id: 'pending', content: `Pending (${pendingCount})` },
    { id: 'in_prod', content: `In Production (${inProdCount})` },
    { id: 'qc', content: `Quality Check (${qcCount})` },
    { id: 'completed', content: `Completed (${completedCount})` },
  ];

  const filteredItems = useMemo(() => {
    if (selectedTabIndex === 0) return queue.filter((i) => i.status === 'Pending');
    if (selectedTabIndex === 1) return queue.filter((i) => i.status === 'In Production');
    if (selectedTabIndex === 2) return queue.filter((i) => i.status === 'Quality Check');
    if (selectedTabIndex === 3) return queue.filter((i) => i.status === 'Completed');
    return queue;
  }, [queue, selectedTabIndex]);

  const handleOpenActionModal = useCallback((job) => {
    setSelectedJob(job);
    setEditTeam(job.assignedTo || 'DTG Team');
    setEditStatus(job.status || 'Pending');
  }, []);

  const handleSaveJob = useCallback(async () => {
    if (!selectedJob) return;
    try {
      const cleanOrderId = selectedJob.orderId.replace('#', '');
      await api.production.update(cleanOrderId, {
        status: editStatus,
        assignedTo: editTeam,
      });

      const toneMap = {
        Pending: 'attention',
        'In Production': 'info',
        'Quality Check': 'warning',
        Completed: 'success',
      };

      setQueue((prev) =>
        prev.map((j) =>
          j.orderId === selectedJob.orderId
            ? {
                ...j,
                assignedTo: editTeam,
                status: editStatus,
                statusTone: toneMap[editStatus] || 'info',
              }
            : j
        )
      );
      setBannerAlert({
        tone: 'success',
        title: 'Production Job Updated',
        message: `Order ${selectedJob.orderId} updated to "${editStatus}" assigned to ${editTeam}.`,
      });
    } catch (err) {
      setBannerAlert({
        tone: 'critical',
        title: 'Update Failed',
        message: err.message || 'Failed to update job status.',
      });
    } finally {
      setSelectedJob(null);
    }
  }, [selectedJob, editTeam, editStatus]);

  const tableRows = filteredItems.map((job) => [
    <Button
      key={job.orderId}
      variant="plain"
      onClick={() => navigate(`${basePath}/orders`)}
    >
      <Text fontWeight="bold" as="span">{job.orderId}</Text>
    </Button>,
    job.customer,
    job.product,
    <InlineStack key={job.orderId} gap="100" alignBlock="center">
      <Badge tone="magic" size="small">Graphic</Badge>
      <Text variant="bodySm" as="span">{job.designName}</Text>
    </InlineStack>,
    <Badge key={job.orderId} tone={job.statusTone || 'info'}>{job.status}</Badge>,
    <Badge key={job.orderId} tone="info">{job.assignedTo || 'Unassigned'}</Badge>,
    <Button
      key={job.orderId}
      size="slim"
      onClick={() => handleOpenActionModal(job)}
    >
      Manage
    </Button>,
  ]);

  return (
    <Page
      title="Production Queue"
      subtitle="Manage approved designs and production workflow."
      primaryAction={{
        content: 'Routing Rules & Settings',
        onAction: () => navigate(`${basePath}/settings`),
      }}
      secondaryActions={[
        {
          content: 'Refresh',
          onAction: fetchQueue,
        },
        {
          content: 'Customizer Studio',
          onAction: () => navigate(`${basePath}/editor`),
        },
      ]}
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

        <Card>
          <BlockStack gap="400">
            <Tabs
              tabs={tabs}
              selected={selectedTabIndex}
              onSelect={setSelectedTabIndex}
            />

            {loading ? (
              <Box padding="800">
                <InlineStack align="center">
                  <Spinner accessibilityLabel="Loading production queue" size="large" />
                </InlineStack>
              </Box>
            ) : filteredItems.length === 0 ? (
              <Box padding="600">
                <BlockStack gap="200" inlineAlign="center">
                  <Text variant="headingMd" as="h3" alignment="center">
                    No jobs in this queue (0)
                  </Text>
                  <Text variant="bodyMd" tone="subdued" as="p" alignment="center">
                    Approved customer orders automatically route here into their designated production queue stage.
                  </Text>
                </BlockStack>
              </Box>
            ) : (
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text', 'text']}
                headings={['Order #', 'Customer', 'Product', 'Design', 'Status', 'Assigned To', 'Actions']}
                rows={tableRows}
              />
            )}
          </BlockStack>
        </Card>
      </BlockStack>

      {/* Manage Production Job Dialog */}
      {selectedJob && (
        <Modal
          open={Boolean(selectedJob)}
          onClose={() => setSelectedJob(null)}
          title={`Manage Production Job: ${selectedJob.orderId}`}
          primaryAction={{
            content: 'Save Changes',
            onAction: handleSaveJob,
          }}
          secondaryActions={[
            {
              content: 'Cancel',
              onAction: () => setSelectedJob(null),
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="400">
              <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                <Text variant="bodyMd" as="p">
                  <strong>Customer:</strong> {selectedJob.customer} | <strong>Product:</strong> {selectedJob.product}
                </Text>
                <Text variant="bodySm" tone="subdued" as="p">
                  Design: {selectedJob.designName}
                </Text>
              </Box>

              <Select
                label="Assign Production Team"
                options={TEAMS}
                value={editTeam}
                onChange={setEditTeam}
              />

              <Select
                label="Update Workflow Status"
                options={STATUS_OPTIONS}
                value={editStatus}
                onChange={setEditStatus}
              />
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}
    </Page>
  );
}
