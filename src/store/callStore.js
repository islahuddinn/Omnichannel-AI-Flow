
import { create } from 'zustand';

export const useCallStore = create((set, get) => ({
    // Active Calls
    activeCalls: [
        {
            id: 'active-1',
            phoneNumber: '+15550123456',
            status: 'Ringing...',
            direction: 'incoming',
            duration: 0,
            isOnHold: false,
        },
        {
            id: 'active-2',
            phoneNumber: '+15550198765',
            status: 'Call connected',
            direction: 'outgoing',
            duration: 45,
            isOnHold: false,
        }
    ],
    selectedActiveCallIndex: 0,

    // Completed Calls
    completedCalls: [
        {
            id: 'completed-1',
            phoneNumber: '+15550112233',
            status: 'Incoming Completed',
            direction: 'incoming',
            duration: 120,
            time: '10:30 AM'
        },
        {
            id: 'completed-2',
            phoneNumber: '+15550112244',
            status: 'Missed Call',
            direction: 'incoming',
            duration: 0,
            time: '09:15 AM'
        }
    ],

    // Actions
    addCompletedCall: (call) => set((state) => ({
        completedCalls: [...state.completedCalls, call]
    })),

    removeCompletedCall: (id) => set((state) => ({
        completedCalls: state.completedCalls.filter((c) => c.id !== id)
    })),

    setSelectedActiveCallIndex: (index) => set({ selectedActiveCallIndex: index }),

    // Helper to update active calls (for future socket integration)
    updateActiveCalls: (calls) => set({ activeCalls: calls }),
}));
