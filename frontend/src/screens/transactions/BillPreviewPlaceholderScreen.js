// BillPreviewPlaceholderScreen.js
// Redirect to BillPreviewScreen, preserving ALL params:
//   - { transactionId, type }  → from TransactionManagementScreen (view saved bill)
//   - { previewPayload, type } → from TransactionCalculationScreen (preview before save)
import { useEffect } from 'react';

export default function BillPreviewPlaceholderScreen({ navigation, route }) {
  const params = route.params || {};

  useEffect(() => {
    navigation.replace('BillPreview', params);
  }, []);

  return null;
}
