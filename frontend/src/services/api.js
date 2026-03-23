
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

// Response interceptor: auto-logout on 401
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('vs_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;