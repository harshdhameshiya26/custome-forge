import { AppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import "@shopify/polaris/build/esm/styles.css";
import UserPage from "../../src/pages/User";

export default function UserLoginRoute() {
  return (
    <AppProvider i18n={enTranslations}>
      <UserPage />
    </AppProvider>
  );
}
