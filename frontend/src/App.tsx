/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { CognitiveProvider } from './context/CognitiveContext';
import { Dashboard } from './components/Dashboard';
import { LandingPage } from './components/LandingPage';
import { AnimatePresence, motion } from 'motion/react';

export default function App() {
  const [started, setStarted] = useState(false);

  return (
    <CognitiveProvider>
      <AnimatePresence mode="wait">
        {!started ? (
          <LandingPage key="landing" onStart={() => setStarted(true)} />
        ) : (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, filter: 'blur(20px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="w-full min-h-screen"
          >
            <Dashboard />
          </motion.div>
        )}
      </AnimatePresence>
    </CognitiveProvider>
  );
}
