import React from 'react';

const ListSkeleton: React.FC = () => (
  <div className="space-y-4 animate-pulse">
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
        <div className="flex flex-col lg:flex-row">
          <div className="lg:w-28 flex-shrink-0 p-4 bg-slate-50 border-b lg:border-b-0 lg:border-r border-gray-100">
            <div className="h-8 w-12 bg-gray-200 rounded mx-auto mb-1" />
            <div className="h-3 w-10 bg-gray-200 rounded mx-auto" />
          </div>
          <div className="flex-1 p-5">
            <div className="h-4 w-3/4 bg-gray-200 rounded mb-3" />
            <div className="h-3 w-1/2 bg-gray-200 rounded mb-2" />
            <div className="h-3 w-full bg-gray-200 rounded mb-2" />
            <div className="h-3 w-2/3 bg-gray-200 rounded" />
            <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between">
              <div className="flex gap-2">
                <div className="h-8 w-8 bg-gray-200 rounded-lg" />
                <div className="h-8 w-8 bg-gray-200 rounded-lg" />
                <div className="h-8 w-8 bg-gray-200 rounded-lg" />
              </div>
              <div className="h-8 w-20 bg-gray-200 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    ))}
  </div>
);

export default React.memo(ListSkeleton);
