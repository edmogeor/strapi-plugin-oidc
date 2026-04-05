/**
 *
 * Initializer
 *
 */

import { useEffect, useRef } from 'react';
import pluginId from '../../pluginId';

export default function Initializer({ setPlugin }) {
  const ref = useRef();
  ref.current = setPlugin;

  useEffect(() => {
    ref.current(pluginId);
  }, []);

  return null;
}
