// src/index.js

import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './css/index.css';
import LoginPage from './components/LoginPage';
import SignPage from './components/SignPage';
import ForgotPage from './components/ForgotPage';
import MainPage from './components/MainPage';
import ProjectPage from './components/ProjectPage';
import reportWebVitals from './reportWebVitals';


const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* 1) 정확히 “/” 일 때 */}
        <Route path="/" element={<LoginPage />} />
        {/* 2) 회원가입, 비번찾기는 명시적으로 등록 */}
        <Route path="/sign" element={<SignPage />} />
        <Route path="/forgot" element={<ForgotPage />} />
        <Route path="/main" element={<MainPage />} />
        <Route path="/project" element={<ProjectPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);

reportWebVitals();
