import Link from 'next/link';

export default function NotFound() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-r from-purple-500 to-pink-500">
            <div className="text-center px-8">
                <h1 className="text-9xl font-bold text-white mb-4">404</h1>
                <div className="w-24 h-1 bg-white mx-auto rounded-full mb-8"></div>
                <h2 className="text-3xl text-white font-light mb-6">
                    Oops! Page Not Found
                </h2>
                <p className="text-lg text-white/80 mb-8">
                    The page you are looking for might have been removed or is temporarily unavailable.
                </p>
                <Link
                    href="/"
                    className="px-6 py-3 bg-white text-purple-600 rounded-full font-semibold 
                                         hover:bg-opacity-90 transition duration-300 inline-block"
                >
                    Go Back Home
                </Link>
            </div>
        </div>
    );
}