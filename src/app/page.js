'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { 
  MessageSquare, 
  Send, 
  Mail, 
  Phone, 
  Instagram,
  Facebook,
  Sparkles,
  Zap,
  Globe,
  TrendingUp,
  Users,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';

export default function LandingPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleGetStarted = () => {
    router.push('/auth/login');
  };

  const platformIcons = [
    { Icon: MessageSquare, delay: '0s', color: 'text-green-500 dark:text-green-400' },
    { Icon: Facebook, delay: '2s', color: 'text-blue-500 dark:text-blue-400' },
    { Icon: Instagram, delay: '4s', color: 'text-pink-500 dark:text-pink-400' },
    { Icon: Send, delay: '6s', color: 'text-cyan-500 dark:text-cyan-400' },
    { Icon: Mail, delay: '8s', color: 'text-blue-500 dark:text-blue-400' },
    { Icon: Phone, delay: '10s', color: 'text-blue-500 dark:text-blue-400' },
  ];

  const features = [
    {
      icon: MessageSquare,
      title: 'Omnichannel',
      description: 'Connect all messaging platforms in one unified inbox',
      color: 'text-green-500 dark:text-green-400'
    },
    {
      icon: Zap,
      title: 'AI-Powered',
      description: 'Intelligent automation and smart routing capabilities',
      color: 'text-yellow-500 dark:text-yellow-400'
    },
    {
      icon: TrendingUp,
      title: 'Analytics',
      description: 'Real-time insights and performance metrics',
      color: 'text-blue-500 dark:text-blue-400'
    },
    {
      icon: Users,
      title: 'Team Collaboration',
      description: 'Seamless collaboration across departments',
      color: 'text-blue-500 dark:text-blue-400'
    }
  ];

  const benefits = [
    'Unified inbox for all channels',
    'AI-powered chatbot integration',
    'Real-time analytics dashboard',
    'Team collaboration tools',
    'Workflow automation',
    'Enterprise-grade security'
  ];

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-gradient-to-br from-blue-50 via-indigo-50 to-sky-50 dark:from-[#0a1628] dark:via-[#0f1a2e] dark:to-[#0d1830]">
      {/* Animated Background Gradients - Dark Mode */}
      <div className="absolute inset-0 opacity-0 dark:opacity-100 transition-opacity duration-500">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/30 rounded-full blur-3xl animate-pulse" 
             style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse" 
             style={{ animationDuration: '10s', animationDelay: '2s' }} />
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-blue-400/20 rounded-full blur-3xl animate-pulse" 
             style={{ animationDuration: '12s', animationDelay: '4s' }} />
      </div>

      {/* Animated Background Gradients - Light Mode */}
      <div className="absolute inset-0 opacity-100 dark:opacity-0 transition-opacity duration-500">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-200/50 rounded-full blur-3xl animate-pulse" 
             style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-indigo-200/40 rounded-full blur-3xl animate-pulse" 
             style={{ animationDuration: '10s', animationDelay: '2s' }} />
      </div>

      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(59,130,246,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.05)_1px,transparent_1px)] bg-[size:50px_50px]" />

      {/* Floating Platform Icons */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20 dark:opacity-100">
        {platformIcons.map(({ Icon, delay, color }, index) => (
          <div
            key={index}
            className={`absolute ${color} transition-opacity duration-500`}
            style={{
              left: `${10 + (index * 15)}%`,
              top: `${20 + (index * 10) % 60}%`,
              animation: `float-icon 20s ease-in-out infinite`,
              animationDelay: delay,
            }}
          >
            <Icon className="w-12 h-12 md:w-16 md:h-16" strokeWidth={1.5} />
          </div>
        ))}
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-12 max-w-7xl mx-auto">
        
        {/* Hero Section */}
        <div className={`text-center mb-12 transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10'}`}>
          {/* Logo */}
          <div className="flex items-center justify-center mb-6 group">
            <div className="relative w-20 h-20 bg-gradient-to-br from-blue-600 to-blue-500 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-500/50 group-hover:scale-110 transition-transform duration-500">
              <Sparkles className="w-10 h-10 text-white animate-pulse" strokeWidth={2} />
              <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-blue-500 rounded-3xl opacity-0 group-hover:opacity-40 blur-2xl transition-all duration-500" />
            </div>
          </div>

          {/* Brand Name */}
          <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold mb-6 tracking-tight">
            <span className="bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600 dark:from-blue-400 dark:via-blue-400 dark:to-blue-500 bg-clip-text text-transparent">
              OmniAiFlow
            </span>
          </h1>
          
          {/* Glowing Underline */}
          <div className="w-32 h-1 mx-auto bg-gradient-to-r from-transparent via-blue-500 to-transparent animate-pulse" />
        </div>

        {/* Tagline */}
        <div className={`text-center mb-12 max-w-3xl transition-all duration-1000 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
          <p className="text-2xl md:text-3xl lg:text-4xl text-gray-800 dark:text-blue-200/80 font-light leading-relaxed mb-4">
            Unifying AI-powered communication across every channel
          </p>
          <p className="text-base md:text-lg text-gray-600 dark:text-blue-300/60 font-light">
            Seamlessly connect WhatsApp, Facebook, Instagram, Email, SMS, and more — all in one intelligent platform
          </p>
        </div>

        {/* CTA Button */}
        <div className={`transition-all duration-1000 delay-500 mb-16 ${mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}>
          <Button
            onClick={handleGetStarted}
            size="lg"
            className="group relative px-12 py-7 text-lg md:text-xl font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-2xl shadow-blue-500/50 hover:shadow-blue-400/70 transition-all duration-300 hover:scale-110 border border-blue-400/30"
          >
            <span className="relative z-10 flex items-center gap-2">
              Get Started
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </span>
            
            {/* Animated Glow Effect */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-400 to-blue-500 opacity-0 group-hover:opacity-30 blur-xl transition-opacity duration-300" />
            
            {/* Shine Effect */}
            <div className="absolute inset-0 rounded-full overflow-hidden">
              <div className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12" />
            </div>
          </Button>
          
          <p className="text-center text-gray-500 dark:text-blue-300/50 text-sm mt-6 font-light">
            No credit card required • Free 14-day trial
          </p>
        </div>

        {/* Features Grid */}
        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16 w-full transition-all duration-1000 delay-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
          {features.map((feature, index) => (
            <div
              key={index}
              className="group p-6 rounded-2xl bg-white/80 dark:bg-white/5 backdrop-blur-sm border border-blue-200 dark:border-blue-500/20 hover:bg-white dark:hover:bg-white/10 hover:border-blue-300 dark:hover:border-blue-400/40 transition-all duration-300 hover:scale-105 hover:shadow-xl"
            >
              <div className={`${feature.color} mb-4 group-hover:scale-110 transition-transform duration-300`}>
                <feature.icon className="w-10 h-10" strokeWidth={2} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-gray-600 dark:text-blue-200/70">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* Benefits Section */}
        <div className={`w-full max-w-4xl transition-all duration-1000 delay-900 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
          <div className="p-8 md:p-12 rounded-3xl bg-white/80 dark:bg-white/5 backdrop-blur-sm border border-blue-200 dark:border-blue-500/20 shadow-xl">
            <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 dark:text-white mb-8">
              Everything You Need to
              <span className="block bg-gradient-to-r from-blue-600 to-blue-500 dark:from-blue-400 dark:to-blue-500 bg-clip-text text-transparent">
                Scale Your Communication
              </span>
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {benefits.map((benefit, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-all duration-300"
                >
                  <CheckCircle2 className="w-6 h-6 text-green-500 dark:text-green-400 flex-shrink-0" strokeWidth={2} />
                  <span className="text-gray-700 dark:text-blue-100 font-medium">
                    {benefit}
                  </span>
                </div>
              ))}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-8 mt-12 pt-8 border-t border-blue-200 dark:border-blue-500/20">
              <div className="text-center">
                <div className="text-4xl font-bold text-gray-900 dark:text-white mb-1">10K+</div>
                <div className="text-sm text-gray-600 dark:text-blue-300/70">Active Users</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-gray-900 dark:text-white mb-1">50M+</div>
                <div className="text-sm text-gray-600 dark:text-blue-300/70">Messages</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-gray-900 dark:text-white mb-1">99.9%</div>
                <div className="text-sm text-gray-600 dark:text-blue-300/70">Uptime</div>
              </div>
            </div>
          </div>
        </div>

        {/* Secondary CTA */}
        <div className={`mt-16 text-center transition-all duration-1000 delay-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
          <h3 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Ready to Transform Your Communication?
          </h3>
          <p className="text-gray-600 dark:text-blue-300/70 mb-6 max-w-2xl mx-auto">
            Join thousands of businesses using OmniAiFlow to streamline their customer communications
          </p>
          <Button
            onClick={handleGetStarted}
            size="lg"
            variant="outline"
            className="group px-10 py-6 text-lg font-semibold border-2 border-blue-500 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400 transition-all duration-300 hover:scale-105 rounded-full"
          >
            <span className="flex items-center gap-2">
              Start Free Trial
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </span>
          </Button>
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-6 left-0 right-0 text-center z-20">
        <p className="text-gray-400 dark:text-blue-300/40 text-sm font-light">
          © 2025 OmniAiFlow. All rights reserved.
        </p>
      </div>

      {/* Custom Animations */}
      <style jsx>{`
        @keyframes float-icon {
          0%, 100% {
            transform: translateY(0px) translateX(0px) rotate(0deg);
          }
          25% {
            transform: translateY(-30px) translateX(20px) rotate(5deg);
          }
          50% {
            transform: translateY(-15px) translateX(-20px) rotate(-5deg);
          }
          75% {
            transform: translateY(-40px) translateX(10px) rotate(3deg);
          }
        }
      `}</style>
    </div>
  );
}