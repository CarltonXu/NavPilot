import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { LocaleProvider } from './i18n/LocaleContext.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';
import { ToastProvider } from './components/ToastProvider.jsx';
import './styles/themes.css';
import './styles/app.css';
import './styles/access.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LocaleProvider>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </LocaleProvider>
  </React.StrictMode>
);
