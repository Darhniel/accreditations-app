/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme() {
  const scheme = useColorScheme();
  // `useColorScheme` resolves to 'light' | 'dark' | null on current RN.
  return Colors[scheme ?? 'light'];
}
