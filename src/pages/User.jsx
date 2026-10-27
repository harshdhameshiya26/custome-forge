import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  EmptyState,
  InlineStack,
  Modal,
  Page,
  Select,
  Tabs,
  Text,
  TextField,
} from '@shopify/polaris';
import api from '../services/api';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/;

const getApiErrorMessage = (error) => {
  const validationMessages = error?.validationErrors
    ?.map((item) => item.message)
    .filter(Boolean);
  return validationMessages?.length
    ? validationMessages.join(' ')
    : error?.message || 'Something went wrong. Please try again.';
};

export default function UserPage() {
  const location = useLocation();
  const navigate = useNavigate();

  // Instant synchronous state from local cache to eliminate loading delays
  const [user, setUser] = useState(() => {
    try {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('customforge_user') : null;
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [mode, setMode] = useState('login');
  const [showSwitchForm, setShowSwitchForm] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    otp: '',
    role: 'merchant',
    supplierCategory: '',
  });

  const [notice, setNotice] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Directory State (Merchants and Suppliers)
  const [directory, setDirectory] = useState([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryTab, setDirectoryTab] = useState(0);
  const [directorySearch, setDirectorySearch] = useState('');

  // Add Supplier Modal State (for merchants)
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const [supplierStage, setSupplierStage] = useState('register');
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [supplierError, setSupplierError] = useState('');
  const [supplierForm, setSupplierForm] = useState({
    fullName: '',
    email: '',
    password: '',
    category: '',
    otp: '',
  });

  const updateField = useCallback((field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setNotice(null);
  }, []);

  const persistSession = useCallback((data) => {
    if (!data?.accessToken) {
      throw new Error('Authentication succeeded without an access token. Please try again.');
    }

    localStorage.setItem('customforge_token', data.accessToken);
    if (data.refreshToken) {
      localStorage.setItem('customforge_refresh_token', data.refreshToken);
    }
    if (data.user) {
      localStorage.setItem('customforge_user', JSON.stringify(data.user));
      setUser(data.user);
      setShowSwitchForm(false);
      window.dispatchEvent(new Event('customforge:auth'));
    }
  }, []);

  // Fetch Directory of registered Merchants and Suppliers
  const fetchDirectory = useCallback(async () => {
    setDirectoryLoading(true);
    try {
      let results = [];
      try {
        const response = await api.users.directory();
        results = Array.isArray(response?.data) ? response.data : [];
      } catch {
        // Fallback to supplier listing if directory endpoint is restricted
        const supplierRes = await api.suppliers.list();
        results = Array.isArray(supplierRes?.data) ? supplierRes.data : [];
      }
      setDirectory(results);
    } catch (err) {
      console.warn('[UserPage] Could not load directory:', err.message);
    } finally {
      setDirectoryLoading(false);
    }
  }, []);

  // Quiet background session restoration (no blocking spinner)
  const restoreSession = useCallback(async () => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('customforge_token') : null;
    if (!token) return;

    try {
      let response;
      try {
        response = await api.users.profile();
      } catch (error) {
        const refreshToken = localStorage.getItem('customforge_refresh_token');
        if (error.status !== 401 || !refreshToken) throw error;

        const refreshed = await api.users.refreshToken({ refreshToken });
        persistSession(refreshed.data);
        response = await api.users.profile();
      }

      const profile = response?.data?.user;
      if (profile) {
        localStorage.setItem('customforge_user', JSON.stringify(profile));
        setUser(profile);
        window.dispatchEvent(new Event('customforge:auth'));
      }
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        localStorage.removeItem('customforge_token');
        localStorage.removeItem('customforge_refresh_token');
        localStorage.removeItem('customforge_user');
        setUser(null);
        window.dispatchEvent(new Event('customforge:auth'));
      }
    }
  }, [persistSession]);

  useEffect(() => {
    restoreSession();
    fetchDirectory();
  }, [restoreSession, fetchDirectory]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (user?.role === 'merchant' && params.get('addSupplier') === '1') {
      setSupplierStage('register');
      setSupplierError('');
      setAddSupplierOpen(true);
    }
  }, [location.search, user?.role]);

  // Global Refresh Action
  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([restoreSession(), fetchDirectory()]);
      setNotice({ tone: 'success', message: 'Account status and partner directory refreshed.' });
    } finally {
      setRefreshing(false);
    }
  };

  const closeAddSupplier = () => {
    setAddSupplierOpen(false);
    setSupplierStage('register');
    setSupplierError('');
    setSupplierForm({ fullName: '', email: '', password: '', category: '', otp: '' });
  };

  const handleAddSupplier = async (event) => {
    event?.preventDefault();
    const email = supplierForm.email.trim().toLowerCase();
    if (supplierForm.fullName.trim().length < 2) {
      setSupplierError('Enter the supplier’s full name.');
      return;
    }
    if (!emailPattern.test(email)) {
      setSupplierError('Enter a valid supplier email address.');
      return;
    }
    if (supplierForm.category.trim().length < 2) {
      setSupplierError('Enter the supplier’s production category.');
      return;
    }
    if (!passwordPattern.test(supplierForm.password)) {
      setSupplierError('Password must be 8–128 characters and include uppercase, lowercase, and a number.');
      return;
    }

    setSupplierLoading(true);
    setSupplierError('');
    try {
      const response = await api.suppliers.register({
        fullName: supplierForm.fullName.trim(),
        email,
        password: supplierForm.password,
        category: supplierForm.category.trim(),
      });
      setSupplierForm((current) => ({ ...current, email, otp: '' }));
      setSupplierStage('verify');
      setNotice({
        tone: 'success',
        message: response.message || 'Supplier registered. A 6-digit verification code was sent to their email.',
      });
      fetchDirectory();
    } catch (registrationError) {
      setSupplierError(getApiErrorMessage(registrationError));
    } finally {
      setSupplierLoading(false);
    }
  };

  const handleVerifySupplier = async (event) => {
    event?.preventDefault();
    if (!/^\d{6}$/.test(supplierForm.otp)) {
      setSupplierError('Enter the 6-digit verification code sent to the supplier.');
      return;
    }
    setSupplierLoading(true);
    setSupplierError('');
    try {
      await api.users.verifyOtp({
        email: supplierForm.email.trim().toLowerCase(),
        otp: supplierForm.otp,
      });
      closeAddSupplier();
      setNotice({
        tone: 'success',
        message: 'Supplier email verified. They are now eligible to receive production schedules.',
      });
      window.dispatchEvent(new Event('customforge:suppliers-updated'));
      fetchDirectory();
    } catch (verificationError) {
      setSupplierError(getApiErrorMessage(verificationError));
    } finally {
      setSupplierLoading(false);
    }
  };

  const validateEmail = () => {
    const email = form.email.trim().toLowerCase();
    if (!emailPattern.test(email)) {
      setFieldErrors((current) => ({ ...current, email: 'Enter a valid email address.' }));
      return null;
    }
    return email;
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    const email = validateEmail();
    if (!email || !form.password) {
      if (!form.password) {
        setFieldErrors((current) => ({ ...current, password: 'Enter your password.' }));
      }
      return;
    }

    setLoading(true);
    setNotice(null);
    try {
      const response = await api.users.login({ email, password: form.password });
      persistSession(response.data);
      setNotice({ tone: 'success', message: response.message || 'You are signed in.' });
      if (location.pathname === '/login') {
        navigate(response.data.user?.role === 'supplier' ? '/supplier/schedules' : '/', { replace: true });
      }
    } catch (error) {
      if (error.action === 'REQUEST_OTP') {
        try {
          await api.users.requestOtp({ email });
          setMode('verify');
          setForm((current) => ({ ...current, email, otp: '' }));
          setNotice({
            tone: 'info',
            message: 'Your email is not verified yet. We sent a new verification code to your inbox.',
          });
        } catch (otpError) {
          setNotice({ tone: 'critical', message: getApiErrorMessage(otpError) });
        }
      } else {
        setNotice({ tone: 'critical', message: getApiErrorMessage(error) });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    const email = validateEmail();
    const errors = {};

    if (form.fullName.trim().length < 2 || form.fullName.trim().length > 120) {
      errors.fullName = 'Enter a name between 2 and 120 characters.';
    }
    if (!passwordPattern.test(form.password)) {
      errors.password = 'Use 8-128 characters with an uppercase letter, a lowercase letter, and a number.';
    }
    if (form.confirmPassword !== form.password) {
      errors.confirmPassword = 'Passwords do not match.';
    }
    if (form.role === 'supplier' && form.supplierCategory.trim().length < 2) {
      errors.supplierCategory = 'Enter a supplier category with at least 2 characters.';
    }
    if (!email || Object.keys(errors).length) {
      setFieldErrors((current) => ({ ...current, ...errors }));
      return;
    }

    setLoading(true);
    setNotice(null);
    try {
      const payload = {
        fullName: form.fullName.trim(),
        email,
        password: form.password,
        role: form.role,
      };
      const response = form.role === 'supplier'
        ? await api.suppliers.register({
            ...payload,
            category: form.supplierCategory.trim(),
          })
        : await api.users.register(payload);
      setMode('verify');
      setForm((current) => ({ ...current, email, otp: '' }));
      setNotice({
        tone: 'success',
        message: response.message || 'A verification code was sent to your email.',
      });
      fetchDirectory();
    } catch (error) {
      if (error.status === 409) {
        setMode('login');
        setForm((current) => ({ ...current, email, password: '', confirmPassword: '' }));
        setNotice({
          tone: 'info',
          message: 'An account already exists for this email. Sign in with your email and password.',
        });
      } else {
        setNotice({ tone: 'critical', message: getApiErrorMessage(error) });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (event) => {
    event.preventDefault();
    const email = validateEmail();
    const otp = form.otp.trim();
    if (!email) return;
    if (!/^\d{6}$/.test(otp)) {
      setFieldErrors((current) => ({ ...current, otp: 'Enter the 6-digit code from your email.' }));
      return;
    }

    setLoading(true);
    setNotice(null);
    try {
      await api.users.verifyOtp({ email, otp });
      setMode('login');
      setForm((current) => ({ ...current, email, password: '', confirmPassword: '', otp: '' }));
      setNotice({
        tone: 'success',
        message: 'Email verified. Sign in with your registered email and password.',
      });
      fetchDirectory();
    } catch (error) {
      setNotice({ tone: 'critical', message: getApiErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    const email = validateEmail();
    if (!email) return;

    setLoading(true);
    setNotice(null);
    try {
      const response = await api.users.requestOtp({ email });
      setNotice({
        tone: 'success',
        message: response.message || 'If the account needs verification, a new code has been sent.',
      });
    } catch (error) {
      setNotice({ tone: 'critical', message: getApiErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    let logoutError;
    try {
      await api.users.logout();
    } catch (error) {
      logoutError = error;
    } finally {
      localStorage.removeItem('customforge_token');
      localStorage.removeItem('customforge_refresh_token');
      localStorage.removeItem('customforge_user');
      setUser(null);
      setShowSwitchForm(false);
      setMode('login');
      setForm({
        fullName: '',
        email: '',
        password: '',
        confirmPassword: '',
        otp: '',
        role: 'merchant',
        supplierCategory: '',
      });
      setLoading(false);
    }

    setNotice(
      logoutError
        ? { tone: 'critical', message: getApiErrorMessage(logoutError) }
        : { tone: 'success', message: 'You have been signed out.' },
    );
  };

  // Quick fill from directory row
  const handleQuickFillFromDirectory = (partner) => {
    setForm((current) => ({
      ...current,
      email: partner.email,
      role: partner.role || 'merchant',
      password: '',
    }));
    setMode('login');
    setShowSwitchForm(true);
    setNotice({
      tone: 'info',
      message: `Selected partner ${partner.fullName} (${partner.email}). Enter password to sign in.`,
    });
  };

  // Filtered directory items
  const filteredDirectory = useMemo(() => {
    return directory.filter((item) => {
      // Role filter
      if (directoryTab === 1 && item.role !== 'merchant' && item.role !== 'store_owner' && item.role !== 'designer') {
        return false;
      }
      if (directoryTab === 2 && item.role !== 'supplier' && item.role !== 'production_staff') {
        return false;
      }
      // Search filter
      if (directorySearch.trim()) {
        const q = directorySearch.toLowerCase().trim();
        const matchName = (item.fullName || '').toLowerCase().includes(q);
        const matchEmail = (item.email || '').toLowerCase().includes(q);
        const matchCategory = (item.supplierCategory || '').toLowerCase().includes(q);
        return matchName || matchEmail || matchCategory;
      }
      return true;
    });
  }, [directory, directoryTab, directorySearch]);

  const directoryTabs = useMemo(() => {
    const merchantCount = directory.filter((i) => i.role === 'merchant' || i.role === 'store_owner' || i.role === 'designer').length;
    const supplierCount = directory.filter((i) => i.role === 'supplier' || i.role === 'production_staff').length;
    return [
      { id: 'all', content: `All Partners (${directory.length})` },
      { id: 'merchants', content: `Merchants & Owners (${merchantCount})` },
      { id: 'suppliers', content: `Suppliers (${supplierCount})` },
    ];
  }, [directory]);

  const sessionDurationText = useMemo(() => {
    if (!user) return '';
    const role = (user.role || '').toLowerCase();
    if (role === 'merchant' || role === 'store_owner' || role === 'designer') {
      return '14-Day Session Duration (Merchant / Designer / Owner)';
    }
    if (role === 'supplier' || role === 'production_staff') {
      return '7-Day Session Duration (Supplier / Production Staff)';
    }
    return '1-Day Session Duration (Customer)';
  }, [user]);

  const pageTitle = user && !showSwitchForm
    ? 'User Account & Session'
    : mode === 'register'
    ? 'Create your account'
    : mode === 'verify'
    ? 'Verify your email'
    : 'Sign in to CustomForge';

  const pageSubtitle = user && !showSwitchForm
    ? 'Review your active session details or switch accounts.'
    : 'Sign in to access your CustomForge merchant hub or supplier mail service.';

  return (
    <Page
      title={pageTitle}
      subtitle={pageSubtitle}
      secondaryActions={[
        {
          content: 'Refresh',
          onAction: handleManualRefresh,
          loading: refreshing,
        },
        ...(user?.role === 'merchant'
          ? [
              {
                content: 'Add Supplier',
                onAction: () => setAddSupplierOpen(true),
              },
            ]
          : []),
      ]}
    >
      <BlockStack gap="500">
        {notice && (
          <Banner tone={notice.tone} onDismiss={() => setNotice(null)}>
            {notice.message}
          </Banner>
        )}

        {/* 1. SESSION STATUS & RE-LOGIN / SWITCH CONTROLS (Displayed when session is active) */}
        {user && (
          <Card>
            <Box padding="500">
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="300" blockAlign="center">
                    <Text variant="headingMd" as="h2">
                      Active User Session: {user.fullName || 'Signed In Partner'}
                    </Text>
                    <Badge tone={user.isVerified ? 'success' : 'attention'}>
                      {user.isVerified ? 'Verified Account' : 'Verification Required'}
                    </Badge>
                  </InlineStack>

                  <Badge tone={user.role === 'supplier' ? 'info' : 'success'}>
                    Role: {user.role?.toUpperCase() || 'MERCHANT'}
                  </Badge>
                </InlineStack>

                <Divider />

                <InlineStack align="space-between" blockAlign="start">
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd">
                      <Text as="span" fontWeight="bold">Registered Email: </Text>
                      {user.email}
                    </Text>
                    <Text as="p" variant="bodyMd">
                      <Text as="span" fontWeight="bold">Session Expiration: </Text>
                      {sessionDurationText}
                    </Text>
                    {user.role === 'supplier' && user.supplierCategory && (
                      <Text as="p" variant="bodyMd">
                        <Text as="span" fontWeight="bold">Specialization: </Text>
                        {user.supplierCategory}
                      </Text>
                    )}
                    {user.shop && (
                      <Text as="p" variant="bodySm" tone="subdued">
                        Connected Store: {user.shop}
                      </Text>
                    )}
                  </BlockStack>

                  <BlockStack gap="200">
                    <InlineStack gap="300">
                      <Button
                        variant={showSwitchForm ? 'primary' : 'secondary'}
                        onClick={() => setShowSwitchForm((prev) => !prev)}
                      >
                        {showSwitchForm ? 'Hide Sign-in Form' : 'Re-login / Switch Account'}
                      </Button>
                      <Button
                        tone="critical"
                        onClick={handleLogout}
                        loading={loading}
                      >
                        Sign Out
                      </Button>
                    </InlineStack>

                    {user.role === 'supplier' ? (
                      <Button
                        variant="plain"
                        onClick={() => navigate('/supplier/schedules')}
                      >
                        Go to Schedule Mail Service →
                      </Button>
                    ) : (
                      <Button
                        variant="plain"
                        onClick={() => navigate('/')}
                      >
                        Go to Merchant Dashboard & Studio →
                      </Button>
                    )}
                  </BlockStack>
                </InlineStack>
              </BlockStack>
            </Box>
          </Card>
        )}

        {/* 2. AUTHENTICATION FORM CARD (Always visible when unauthenticated, or toggled via Switch Account) */}
        {(!user || showSwitchForm) && (
          <Card>
            <Box padding="500">
              <BlockStack gap="400">
                {showSwitchForm && (
                  <Banner tone="info">
                    Switching accounts: Submit credentials for a different partner or select one from the directory below.
                  </Banner>
                )}

                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd" as="h3">
                    {mode === 'login'
                      ? (showSwitchForm ? 'Switch CustomForge Account' : 'Partner Sign In')
                      : mode === 'register'
                      ? 'Partner Registration'
                      : 'Email Verification'}
                  </Text>
                  {mode !== 'login' && (
                    <Button variant="plain" onClick={() => setMode('login')}>
                      Back to Sign In
                    </Button>
                  )}
                </InlineStack>

                {mode === 'login' && (
                  <form onSubmit={handleLogin}>
                    <BlockStack gap="400">
                      <TextField
                        label="Email Address"
                        type="email"
                        value={form.email}
                        onChange={(value) => updateField('email', value)}
                        autoComplete="email"
                        error={fieldErrors.email}
                        helpText="Enter your registered merchant or supplier email."
                        requiredIndicator
                      />
                      <TextField
                        label="Password"
                        type="password"
                        maxLength={128}
                        value={form.password}
                        onChange={(value) => updateField('password', value)}
                        autoComplete="current-password"
                        error={fieldErrors.password}
                        requiredIndicator
                      />
                      <InlineStack gap="300" align="space-between" blockAlign="center">
                        <InlineStack gap="300">
                          <Button variant="primary" submit loading={loading}>
                            {showSwitchForm ? 'Switch & Sign In' : 'Sign In'}
                          </Button>
                          <Button
                            variant="plain"
                            onClick={() => {
                              setMode('register');
                              setNotice(null);
                              setFieldErrors({});
                            }}
                          >
                            Create an Account
                          </Button>
                        </InlineStack>

                        <Text as="span" variant="bodySm" tone="subdued">
                          Merchants (14d token) • Suppliers (7d token)
                        </Text>
                      </InlineStack>
                    </BlockStack>
                  </form>
                )}

                {mode === 'register' && (
                  <form onSubmit={handleRegister}>
                    <BlockStack gap="400">
                      <Select
                        label="Select User Role"
                        options={[
                          {
                            label: 'Merchant / Store Owner (14-day token — Full customization studio & order access)',
                            value: 'merchant',
                          },
                          {
                            label: 'Supplier / Production Staff (7-day token — Schedule mail service & batch handoffs)',
                            value: 'supplier',
                          },
                          {
                            label: 'Designer (14-day token — Templates, art check, & review capabilities)',
                            value: 'designer',
                          },
                        ]}
                        value={form.role}
                        onChange={(value) => {
                          updateField('role', value);
                          setFieldErrors((current) => ({
                            ...current,
                            supplierCategory: undefined,
                          }));
                        }}
                      />
                      {form.role === 'supplier' && (
                        <TextField
                          label="Supplier Category Specialization"
                          value={form.supplierCategory}
                          onChange={(value) => updateField('supplierCategory', value)}
                          autoComplete="organization-title"
                          helpText="E.g. Apparel, Drinkware, Leather, Metal, Paper, or Packaging"
                          error={fieldErrors.supplierCategory}
                          requiredIndicator
                        />
                      )}
                      <TextField
                        label="Full Name"
                        value={form.fullName}
                        onChange={(value) => updateField('fullName', value)}
                        autoComplete="name"
                        error={fieldErrors.fullName}
                        requiredIndicator
                      />
                      <TextField
                        label="Email Address"
                        type="email"
                        value={form.email}
                        onChange={(value) => updateField('email', value)}
                        autoComplete="email"
                        error={fieldErrors.email}
                        requiredIndicator
                      />
                      <TextField
                        label="Password"
                        type="password"
                        maxLength={128}
                        value={form.password}
                        onChange={(value) => updateField('password', value)}
                        autoComplete="new-password"
                        helpText="8-128 characters, uppercase, lowercase, and numeric digit."
                        error={fieldErrors.password}
                        requiredIndicator
                      />
                      <TextField
                        label="Confirm Password"
                        type="password"
                        maxLength={128}
                        value={form.confirmPassword}
                        onChange={(value) => updateField('confirmPassword', value)}
                        autoComplete="new-password"
                        error={fieldErrors.confirmPassword}
                        requiredIndicator
                      />
                      <InlineStack gap="300">
                        <Button variant="primary" submit loading={loading}>
                          Complete Registration & Send OTP
                        </Button>
                        <Button variant="plain" onClick={() => setMode('login')}>
                          Cancel
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </form>
                )}

                {mode === 'verify' && (
                  <form onSubmit={handleVerify}>
                    <BlockStack gap="400">
                      <TextField
                        label="Email Address"
                        type="email"
                        value={form.email}
                        onChange={(value) => updateField('email', value)}
                        autoComplete="email"
                        error={fieldErrors.email}
                        requiredIndicator
                      />
                      <TextField
                        label="6-Digit Verification Code (OTP)"
                        value={form.otp}
                        onChange={(value) => updateField('otp', value.replace(/\D/g, '').slice(0, 6))}
                        autoComplete="one-time-code"
                        inputMode="numeric"
                        error={fieldErrors.otp}
                        helpText="Enter the 6-digit verification code dispatched to your registered email."
                        requiredIndicator
                      />
                      <InlineStack gap="300">
                        <Button variant="primary" submit loading={loading}>
                          Verify Code & Sign In
                        </Button>
                        <Button onClick={handleResendOtp} loading={loading}>
                          Resend Code
                        </Button>
                        <Button variant="plain" onClick={() => setMode('login')}>
                          Back to Sign In
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </form>
                )}
              </BlockStack>
            </Box>
          </Card>
        )}

        {/* 3. MERCHANTS & SUPPLIERS DIRECTORY SECTION (Below Form) */}
        <Card>
          <Box padding="500">
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text variant="headingMd" as="h3">
                    Merchants &amp; Suppliers Directory
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Quick-reference directory of registered CustomForge partners. Click any row to populate the login form.
                  </Text>
                </BlockStack>

                <Button
                  size="slim"
                  onClick={fetchDirectory}
                  loading={directoryLoading}
                >
                  Refresh Directory
                </Button>
              </InlineStack>

              <InlineStack align="space-between" blockAlign="center" gap="400">
                <Box width="100%">
                  <TextField
                    label="Search Directory"
                    labelHidden
                    placeholder="Search directory by name, email, or category..."
                    value={directorySearch}
                    onChange={setDirectorySearch}
                    autoComplete="off"
                    clearButton
                    onClearButtonClick={() => setDirectorySearch('')}
                  />
                </Box>
              </InlineStack>

              <Tabs
                tabs={directoryTabs}
                selected={directoryTab}
                onSelect={setDirectoryTab}
              />

              {directoryLoading && directory.length === 0 ? (
                <Box padding="400">
                  <Text as="p" tone="subdued">Loading partner directory...</Text>
                </Box>
              ) : filteredDirectory.length === 0 ? (
                <EmptyState
                  heading="No partners found"
                  image=""
                >
                  <Text as="p" tone="subdued">
                    {directorySearch
                      ? `No partners matched "${directorySearch}".`
                      : 'No registered partners found in this directory category yet.'}
                  </Text>
                </EmptyState>
              ) : (
                <BlockStack gap="200">
                  {filteredDirectory.map((partner) => {
                    const isCurrent = user && user.email === partner.email;
                    const isSupplier = partner.role === 'supplier' || partner.role === 'production_staff';
                    return (
                      <Card key={partner._id || partner.id || partner.email}>
                        <Box padding="300">
                          <InlineStack align="space-between" blockAlign="center">
                            <BlockStack gap="100">
                              <InlineStack gap="200" blockAlign="center">
                                <Text fontWeight="bold" as="span" variant="bodyMd">
                                  {partner.fullName || 'CustomForge Partner'}
                                </Text>
                                <Badge tone={isSupplier ? 'info' : 'success'}>
                                  {partner.role?.toUpperCase() || 'MERCHANT'}
                                </Badge>
                                {partner.isVerified ? (
                                  <Badge tone="success" size="small">Verified</Badge>
                                ) : (
                                  <Badge tone="attention" size="small">Pending OTP</Badge>
                                )}
                                {isCurrent && (
                                  <Badge tone="magic" size="small">Current Session</Badge>
                                )}
                              </InlineStack>

                              <InlineStack gap="300" blockAlign="center">
                                <Text as="span" variant="bodySm" tone="subdued">
                                  {partner.email}
                                </Text>
                                {isSupplier && partner.supplierCategory && (
                                  <Text as="span" variant="bodySm">
                                    • Category: <Text as="span" fontWeight="bold">{partner.supplierCategory}</Text>
                                  </Text>
                                )}
                                {partner.shop && (
                                  <Text as="span" variant="bodySm" tone="subdued">
                                    • Store: {partner.shop}
                                  </Text>
                                )}
                              </InlineStack>
                            </BlockStack>

                            <Button
                              size="slim"
                              onClick={() => handleQuickFillFromDirectory(partner)}
                            >
                              {isCurrent ? 'Re-login' : 'Switch to Account'}
                            </Button>
                          </InlineStack>
                        </Box>
                      </Card>
                    );
                  })}
                </BlockStack>
              )}
            </BlockStack>
          </Box>
        </Card>

        {/* MODAL: ADD SUPPLIER (For Merchants) */}
        <Modal
          open={addSupplierOpen}
          onClose={closeAddSupplier}
          title={supplierStage === 'register' ? 'Add Supplier Partner' : 'Verify Supplier Email'}
          primaryAction={{
            content: supplierStage === 'register' ? 'Register Supplier & Send OTP' : 'Verify Supplier',
            onAction: supplierStage === 'register' ? handleAddSupplier : handleVerifySupplier,
            loading: supplierLoading,
            disabled: supplierLoading,
          }}
          secondaryActions={[
            { content: 'Cancel', onAction: closeAddSupplier, disabled: supplierLoading },
          ]}
        >
          <Modal.Section>
            <form onSubmit={supplierStage === 'register' ? handleAddSupplier : handleVerifySupplier}>
              <BlockStack gap="400">
                {supplierStage === 'register' ? (
                  <>
                    <Text as="p" tone="subdued">
                      Suppliers receive email notifications and production batches for designated categories.
                    </Text>
                    <TextField
                      label="Full Name"
                      value={supplierForm.fullName}
                      onChange={(value) => setSupplierForm((current) => ({ ...current, fullName: value }))}
                      autoComplete="name"
                      requiredIndicator
                    />
                    <TextField
                      label="Email Address"
                      type="email"
                      value={supplierForm.email}
                      onChange={(value) => setSupplierForm((current) => ({ ...current, email: value }))}
                      autoComplete="email"
                      requiredIndicator
                    />
                    <TextField
                      label="Production Category Specialization"
                      value={supplierForm.category}
                      onChange={(value) => setSupplierForm((current) => ({ ...current, category: value }))}
                      autoComplete="organization-title"
                      helpText="E.g. Apparel, Leather, Drinkware, Metal, Paper, or Packaging."
                      requiredIndicator
                    />
                    <TextField
                      label="Temporary Initial Password"
                      type="password"
                      value={supplierForm.password}
                      onChange={(value) => setSupplierForm((current) => ({ ...current, password: value }))}
                      autoComplete="new-password"
                      helpText="Share this securely with the supplier. They will sign in after email verification."
                      requiredIndicator
                    />
                  </>
                ) : (
                  <>
                    <Text as="p">
                      Enter the 6-digit confirmation code dispatched to {supplierForm.email}.
                    </Text>
                    <TextField
                      label="Email Verification Code"
                      value={supplierForm.otp}
                      onChange={(value) =>
                        setSupplierForm((current) => ({
                          ...current,
                          otp: value.replace(/\D/g, '').slice(0, 6),
                        }))
                      }
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      maxLength={6}
                      requiredIndicator
                    />
                  </>
                )}
                {supplierError && <Banner tone="critical">{supplierError}</Banner>}
              </BlockStack>
            </form>
          </Modal.Section>
        </Modal>
      </BlockStack>
    </Page>
  );
}
