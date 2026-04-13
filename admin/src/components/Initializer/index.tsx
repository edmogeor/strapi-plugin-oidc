import { useEffect, useRef } from 'react';
import pluginId from '../../pluginId';

export default function Initializer({ setPlugin }: { setPlugin: (id: string) => void }) {
  const ref = useRef<(id: string) => void>();
  ref.current = setPlugin;

  useEffect(() => {
    if (ref.current) {
      ref.current(pluginId);
    }
  }, []);

  return null;
}
