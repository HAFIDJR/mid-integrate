import type { ReportRangeId, TopMode } from '../lib/analytics';
import type { SortId, StockFilterId } from '../lib/constants';

/**
 * View-local filter state that used to live in the vanilla app's global `state`
 * object. Keeping it in a module means filters survive view switches, exactly as
 * they did before (it is never written to localStorage).
 */
export const uiState = {
  pSearch: '',
  pCat: 'All' as string,
  pSort: 'name' as SortId,
  pStock: 'all' as StockFilterId,
  rRange: '7d' as ReportRangeId,
  rFrom: '',
  rTo: '',
  rTopMode: 'units' as TopMode,
};

export function resetUiState(): void {
  uiState.pSearch = '';
  uiState.pCat = 'All';
  uiState.pSort = 'name';
  uiState.pStock = 'all';
  uiState.rRange = '7d';
  uiState.rFrom = '';
  uiState.rTo = '';
  uiState.rTopMode = 'units';
}
