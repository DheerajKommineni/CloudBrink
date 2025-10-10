const Home = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F5FAFA] to-[#E6F8F9] flex flex-col items-center justify-center text-center px-6">
      <h1 className="text-4xl font-bold text-darkText mb-4">
        Welcome to <span className="text-primary">Cloudbrink Docs Portal</span>
      </h1>
      <p className="text-gray-600 max-w-2xl mb-8">
        This is a portal for accessing Cloudbrink's documentation
      </p>
      <a
        href="/docs"
        className="px-6 py-3 bg-primary text-white rounded-full font-medium hover:bg-accent transition-colors duration-200 shadow-md"
      >
        Go to Documentation
      </a>
    </div>
  );
};

export default Home;
