// Image placeholder component — swap src later when you have real photos.
// Usage: <ImagePlaceholder label="President Photo" className="w-full h-48" />
// To use a real image later, just replace this component with:
//   <img src="/images/president.jpg" alt="President" className="w-full h-48 object-cover" />

export default function ImagePlaceholder({ label = 'Image', className = '' }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 bg-surface-container-high border-2 border-dashed border-outline-variant rounded-lg ${className}`}
    >
      <span className="material-symbols-outlined text-4xl text-outline-variant">
        image
      </span>
      <span className="text-xs font-bold text-outline uppercase tracking-wider text-center px-2">
        {label}
      </span>
    </div>
  );
}
