import React, { useState } from 'react';
import { BrandIcon, EyeIcon, EyeOffIcon, SpinnerIcon } from './icons';

interface AuthScreenProps {
    onLogin: (user: { displayName: string; email: string }) => void;
    initialMode: 'signUp' | 'signIn';
}

// User type for our local storage "database"
interface StoredUser {
    email: string;
    password: string; // In a real app, this would be a hash
    displayName: string;
}

// Helper functions to interact with localStorage
const getUsers = (): StoredUser[] => {
    try {
        const usersJson = localStorage.getItem('mma_users');
        return usersJson ? JSON.parse(usersJson) : [];
    } catch (error) {
        console.error("Error reading users from localStorage:", error);
        return [];
    }
};

const saveUsers = (users: StoredUser[]) => {
    try {
        localStorage.setItem('mma_users', JSON.stringify(users));
    } catch (error) {
        console.error("Error saving users to localStorage:", error);
    }
};

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin, initialMode }) => {
  const [isSignUp, setIsSignUp] = useState(initialMode === 'signUp');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Simulate a network request to make it feel real
    setTimeout(() => {
        const users = getUsers();

        if (isSignUp) {
            // --- Sign Up Logic ---
            if (!fullName.trim()) {
                setError("Full name is required for sign up.");
                setIsLoading(false);
                return;
            }
            if (password !== confirmPassword) {
                setError("Passwords do not match.");
                setIsLoading(false);
                return;
            }

            const existingUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
            if (existingUser) {
                setError("An account with this email already exists. Please sign in.");
                setIsLoading(false);
                return;
            }
            
            // Add new user to our "database"
            const newUser: StoredUser = { email: email.toLowerCase(), password, displayName: fullName };
            saveUsers([...users, newUser]);
            
            // Automatically log in after successful sign up
            onLogin({ displayName: fullName, email: email });

        } else {
            // --- Sign In Logic ---
            const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

            if (!user) {
                setError("No account found with this email. Please sign up.");
                setIsLoading(false);
                return;
            }

            if (user.password !== password) {
                setError("Incorrect password. Please try again.");
                setIsLoading(false);
                return;
            }

            // Successful sign in
            onLogin({ displayName: user.displayName, email: user.email });
        }

        // This path is only reached on success, but the component unmounts.
        // If there were other logic, we'd set loading to false here.
        // setIsLoading(false);
    }, 500);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-800 p-8 rounded-lg shadow-2xl border border-slate-700">
        <div className="flex flex-col items-center mb-6">
            <BrandIcon className="h-12 w-12 text-yellow-400 mb-3" />
            <h1 className="text-2xl font-bold text-slate-100">Moubarak Media Insights</h1>
            <p className="text-yellow-400 font-semibold">AI Edition</p>
        </div>
        
        <h2 className="text-xl font-semibold text-center text-slate-200 mb-6">{isSignUp ? 'Create an Account' : 'Sign In'}</h2>
        
        <form onSubmit={handleAuth} className="space-y-4">
          {isSignUp && (
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1" htmlFor="fullName">Full Name</label>
              <input 
                id="fullName"
                type="text" 
                value={fullName} 
                onChange={e => setFullName(e.target.value)} 
                placeholder="Enter your full name"
                className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 outline-none"
                required
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1" htmlFor="email">Email Address</label>
            <input 
              id="email"
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              placeholder="Enter your email address"
              className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1" htmlFor="password">Password</label>
            <div className="relative">
                <input 
                  id="password"
                  type={showPassword ? "text" : "password"} 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  placeholder="Enter your password"
                  className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 outline-none"
                  minLength={8}
                  required
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 px-3 text-slate-400 hover:text-slate-200">
                    {showPassword ? <EyeOffIcon className="w-5 h-5"/> : <EyeIcon className="w-5 h-5"/>}
                </button>
            </div>
          </div>
           {isSignUp && (
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1" htmlFor="confirmPassword">Confirm Password</label>
              <input 
                id="confirmPassword"
                type={showPassword ? "text" : "password"} 
                value={confirmPassword} 
                onChange={e => setConfirmPassword(e.target.value)} 
                placeholder="Confirm your password"
                className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 outline-none"
                minLength={8}
                required
              />
            </div>
          )}
          
          {error && <p className="text-red-400 text-sm text-center bg-red-900/50 p-2 rounded-md">{error}</p>}
          
          <button 
            type="submit"
            disabled={isLoading}
            className="w-full bg-yellow-600 hover:bg-yellow-500 text-white font-bold p-2 rounded-md transition-colors disabled:opacity-50 flex items-center justify-center"
          >
            {isLoading ? (
              <>
                <SpinnerIcon className="w-5 h-5 mr-2"/>
                Processing...
              </>
            ) : (isSignUp ? 'Sign Up' : 'Sign In')}
          </button>
        </form>
        
        <p className="text-center text-sm text-slate-400 mt-6">
          {isSignUp ? 'Already have an account?' : 'Don’t have an account?'}
          <button onClick={() => { setIsSignUp(!isSignUp); setError(''); }} className="font-semibold text-yellow-400 hover:text-yellow-300 ml-1">
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </p>
      </div>
    </div>
  );
};