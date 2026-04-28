declare module 'react-dom/client' {
  export function createRoot(container: Element): { render: (element: unknown) => void };
}
