import { AppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import "@shopify/polaris/build/esm/styles.css";
import SupplierSchedules from "../../src/pages/SupplierSchedules";

export default function SupplierSchedulesRoute() {
  return (
    <AppProvider i18n={enTranslations}>
      <SupplierSchedules />
    </AppProvider>
  );
}
