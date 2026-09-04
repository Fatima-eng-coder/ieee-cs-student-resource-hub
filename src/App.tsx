import { Analytics } from '@vercel/analytics/react';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/routes';
import { AuthProvider } from '@/context/AuthContext';

function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
      {/*
        Vercel's own analytics: page views and visitor counts, collected without cookies and
        without a client id, so there is nothing to disclose in a banner and nothing about an
        individual to hold. It sits outside the router on purpose -- one mount for the whole
        app, which then reports every route change itself.

        It is inert off Vercel: the script only loads in production on a Vercel deployment, so
        local development and any other host send nothing.
      */}
      <Analytics />
    </AuthProvider>
  );
}

export default App;
