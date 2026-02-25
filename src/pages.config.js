/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import Catalog from './pages/Catalog';
import CatalogNumbers from './pages/CatalogNumbers';
import DataExchange from './pages/DataExchange';
import FeePlanning from './pages/FeePlanning';
import FreeCatalogNumbers from './pages/FreeCatalogNumbers';
import ReleaseDetail from './pages/ReleaseDetail';
import Scheduler from './pages/Scheduler';
import Upload from './pages/Upload';
import ZipQueue from './pages/ZipQueue';
import ZipUpload from './pages/ZipUpload';
import Settings from './pages/Settings';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Catalog": Catalog,
    "CatalogNumbers": CatalogNumbers,
    "DataExchange": DataExchange,
    "FeePlanning": FeePlanning,
    "FreeCatalogNumbers": FreeCatalogNumbers,
    "ReleaseDetail": ReleaseDetail,
    "Scheduler": Scheduler,
    "Upload": Upload,
    "ZipQueue": ZipQueue,
    "ZipUpload": ZipUpload,
    "Settings": Settings,
}

export const pagesConfig = {
    mainPage: "Catalog",
    Pages: PAGES,
    Layout: __Layout,
};