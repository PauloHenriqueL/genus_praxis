import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// basename = caminho base do build (import.meta.env.BASE_URL). É '/' no deploy
// full-stack (Railway); só muda se o app for servido sob um subcaminho.
ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter basename={import.meta.env.BASE_URL}>
    <App />
  </BrowserRouter>
)
