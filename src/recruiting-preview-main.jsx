import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import RecruitingPreview from './pages/RecruitingPreview';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <RecruitingPreview />
    </BrowserRouter>
  </React.StrictMode>,
);
