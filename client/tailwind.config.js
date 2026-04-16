/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Toss blue
        brand: {
          50: "#EBF3FE",
          100: "#D3E4FD",
          200: "#A7C8FC",
          300: "#7AADFA",
          400: "#4D91F8",
          500: "#3182F6", // primary
          600: "#1B64DA",
          700: "#1957C2",
          800: "#164AA8",
          900: "#123E8E",
        },
        // Toss-style neutrals
        ink: {
          900: "#191F28",
          800: "#333D4B",
          700: "#4E5968",
          600: "#6B7684",
          500: "#8B95A1",
          400: "#B0B8C1",
          300: "#D1D6DB",
          200: "#E5E8EB",
          100: "#F2F4F6",
          50: "#F9FAFB",
        },
        success: "#12B886",
        warning: "#F59F00",
        danger: "#F04452",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(0,0,0,.04)",
        card: "0 1px 3px rgba(0,0,0,.04), 0 2px 8px rgba(0,0,0,.04)",
        pop: "0 10px 30px rgba(0,0,0,.08)",
      },
      borderRadius: {
        xl: "14px",
        "2xl": "20px",
        "3xl": "28px",
      },
      fontFamily: {
        sans: [
          "Pretendard",
          "Pretendard Variable",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "Apple SD Gothic Neo",
          "Noto Sans KR",
          "Roboto",
          "Helvetica Neue",
          "Segoe UI",
          "sans-serif",
        ],
      },
      letterSpacing: {
        tight: "-0.02em",
        tighter: "-0.03em",
      },
    },
  },
  plugins: [],
};
