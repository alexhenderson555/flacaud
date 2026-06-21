import React from 'react';
import { Home, RefreshCw } from 'lucide-react';
import { reportClientError } from '../clientObservability';
import TelegramIcon from './icons/TelegramIcon';
import { clearChunkReloadFlag, isChunkLoadError, reloadForStaleChunks } from '../utils/chunkRecovery';
import {
  buildTelegramErrorUrl,
  detectUiLang,
  errorSupportCopy,
} from '../utils/errorSupport';
import '../styles/error-boundary.css';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    if (isChunkLoadError(error) && reloadForStaleChunks()) {
      return;
    }
    reportClientError(error, {
      component: 'ErrorBoundary',
      componentStack: errorInfo?.componentStack,
    });
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReload = () => {
    clearChunkReloadFlag();
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error } = this.state;
    const lang = detectUiLang();
    const copy = errorSupportCopy(lang);
    const chunk = isChunkLoadError(error);
    const telegramUrl = buildTelegramErrorUrl(error);

    return (
      <div className="error-boundary" role="alert">
        <div className="error-boundary__card glass-panel">
          <h1 className="error-boundary__title">
            {chunk ? copy.chunkTitle : copy.title}
          </h1>
          <p className="error-boundary__body">
            {chunk ? copy.chunkBody : copy.body}
          </p>
          <div className="error-boundary__actions">
            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="error-boundary__btn error-boundary__btn--telegram"
            >
              <TelegramIcon size={18} />
              {copy.telegram}
            </a>
            <button
              type="button"
              className="error-boundary__btn error-boundary__btn--ghost"
              onClick={this.handleReload}
            >
              <RefreshCw size={17} aria-hidden />
              {copy.reload}
            </button>
            <a href="/" className="error-boundary__btn error-boundary__btn--ghost">
              <Home size={17} aria-hidden />
              {copy.home}
            </a>
          </div>
        </div>
      </div>
    );
  }
}
