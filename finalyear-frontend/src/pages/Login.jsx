import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "../config/axios";
import "./Login.css";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await axios.post("/api/auth/login", {
        email,
        password,
      }, {
        headers: {
          'Cache-Control': 'no-cache'
        }
      });

      const { token, role, email: userEmail, username } = res.data;

      // Validate token data
      if (!token || !role || !userEmail) {
        console.error('Invalid login response:', res.data);
        throw new Error('Server returned incomplete login data');
      }

      // Decode token to verify its contents
      try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(window.atob(base64));
        
        // Verify token contains required fields
        if (!payload.email || !payload.role || !payload.id) {
          console.error('Invalid token payload:', payload);
          throw new Error('Invalid token structure');
        }

        // Verify token data matches response data
        if (payload.email !== userEmail || payload.role !== role) {
          console.error('Token data mismatch:', {
            token: payload,
            response: { email: userEmail, role }
          });
          throw new Error('Token data mismatch');
        }
      } catch (e) {
        console.error('Token validation failed:', e);
        throw new Error('Invalid token received from server');
      }

      // Store validated data
      localStorage.setItem("token", token);
      localStorage.setItem("role", role);
      localStorage.setItem("email", userEmail);
      localStorage.setItem("userName", username); // Changed to camelCase for consistency

      // Log successful login
      console.log('Login successful:', {
        role,
        email: userEmail,
        username
      });

      // Redirect by role
      if (role === "team_member") navigate("/member");
      else if (role === "team_lead") navigate("/lead");
      else if (role === "project_manager") navigate("/pm");
    } catch (err) {
      console.error('Login error:', err);
      let errorMessage;
      if (!err.response) {
        errorMessage = "Network error. Please check if the server is running.";
      } else if (err.response.status === 400) {
        errorMessage = "Invalid email or password.";
      } else {
        errorMessage = err.response.data.message || "An unknown error occurred.";
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      {/* Background decoration */}
      <div className="login-background">
        <div className="circle circle-1"></div>
        <div className="circle circle-2"></div>
        <div className="circle circle-3"></div>
      </div>

      {/* Login Card */}
      <div className="login-card">
        {/* Company Logo/Name Section */}
        <div className="login-header">
          <div className="company-logo">
            <i className="fas fa-building"></i>
          </div>
          <h1 className="company-name">Ju Enterprises</h1>
          <p className="company-tagline">Employee Management Portal</p>
        </div>

        {/* Employee Profile Picture Placeholder */}
        <div className="profile-picture-section">
          <div className="profile-picture">
            <i className="fas fa-user"></i>
          </div>
          <p className="profile-text">Employee Login</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="login-form">
          {/* Error Message */}
          {error && (
            <div className="error-message">
              <i className="fas fa-exclamation-circle"></i>
              <span>{error}</span>
            </div>
          )}

          {/* Email Input */}
          <div className="input-group">
            <label htmlFor="email">Email Address</label>
            <div className="input-wrapper">
              <i className="fas fa-envelope input-icon"></i>
              <input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                autoComplete="email"
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="input-group">
            <label htmlFor="password">Password</label>
            <div className="input-wrapper">
              <i className="fas fa-lock input-icon"></i>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex="-1"
              >
                <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
              </button>
            </div>
          </div>

          {/* Remember Me & Forgot Password */}
          <div className="form-options">
            <label className="remember-me">
              <input type="checkbox" />
              <span>Remember me</span>
            </label>
            <a href="#" className="forgot-password">Forgot password?</a>
          </div>

          {/* Login Button */}
          <button 
            type="submit" 
            className="login-button"
            disabled={loading}
          >
            {loading ? (
              <>
                <i className="fas fa-spinner fa-spin"></i>
                Logging in...
              </>
            ) : (
              <>
                <i className="fas fa-sign-in-alt"></i>
                Login
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="login-footer">
          <p>Secure Performance Analytics & Alerting System • Internal Access</p>
        </div>
      </div>
    </div>
  );
}

export default Login;
