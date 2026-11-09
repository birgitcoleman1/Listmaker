import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import SiteRoutes from './Router.jsx';
createRoot(document.getElementById('root')).render(<BrowserRouter><SiteRoutes/></BrowserRouter>);
