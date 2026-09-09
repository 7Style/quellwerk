import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from './store';

/**
 * Typed dispatch hook for Redux store
 */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();

/**
 * Typed selector hook for Redux store
 */
export const useAppSelector = useSelector.withTypes<RootState>();
