import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const BASE_URL = "https://niss.pro";

export default function SeoManager() {
  const location = useLocation();

  useEffect(() => {
    const pathname = location.pathname;

    // Helper function to get or create a meta tag
    const setMetaTag = (nameAttr, nameVal, contentVal) => {
      let element = document.querySelector(`meta[${nameAttr}="${nameVal}"]`);
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute(nameAttr, nameVal);
        document.head.appendChild(element);
      }
      element.setAttribute("content", contentVal);
    };

    // Helper function to set canonical link
    const setCanonical = (hrefVal) => {
      let link = document.querySelector("link[rel='canonical']");
      if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", "canonical");
        document.head.appendChild(link);
      }
      link.setAttribute("href", hrefVal);
    };

    if (pathname === "/login") {
      document.title = "NISS HRMS Login | Nidhi Impex Silver Star";
      setMetaTag(
        "name",
        "description",
        "Sign in to NISS HRMS, the Nidhi Impex Silver Star Human Resource Management System."
      );
      setMetaTag("name", "robots", "index, follow");
      setCanonical(`${BASE_URL}/login`);
    } else if (pathname === "/about-niss") {
      document.title = "About NISS HRMS | Nidhi Impex Silver Star";
      setMetaTag(
        "name",
        "description",
        "Learn about NISS HRMS (Nidhi Impex Silver Star Human Resource Management System), providing employee management, payroll, attendance, leave, and HR operations."
      );
      setMetaTag("name", "robots", "index, follow");
      setCanonical(`${BASE_URL}/about-niss`);
    } else if (pathname === "/") {
      document.title = "NISS HRMS | Nidhi Impex Silver Star";
      setMetaTag(
        "name",
        "description",
        "NISS HRMS – Nidhi Impex Silver Star Human Resource Management System for employee management, attendance, leave, payroll, HR operations and employee self-service."
      );
      setMetaTag("name", "robots", "index, follow");
      setCanonical(`${BASE_URL}/`);
    } else {
      // Private/authenticated HRMS routes: strictly protect sensitive HR & employee data from search engine indexing
      document.title = "NISS HRMS | Nidhi Impex Silver Star";
      setMetaTag("name", "robots", "noindex, nofollow");
      setCanonical(`${BASE_URL}${pathname}`);
    }
  }, [location]);

  return null;
}
