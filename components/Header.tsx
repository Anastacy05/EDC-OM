import Image from "next/image";

export default function Header() {
    return (
        <div className="w-full h-15 bg-blue-500 flex items-center justify-between px-8 border-b-2 border-blue-600">
            
            <div className="relative w-12 h-12 rounded-xl overflow-hidden">
                <Image
                    src='/logo.jpeg'
                    alt="Logo"
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover"
                />
            </div>

            <div className="flex items-center justify-center gap-10 transition-all duration-500">
                <div className="py-2 px-4 rounded-lg bg-blue-300 hover:bg-blue-400 text-white shadow-md cursor-pointer shadow-blue-950/20">
                	S'incrire
                </div>
                <div className="py-2 px-4 rounded-lg bg-white hover:bg-blue-100 text-dark shadow-md cursor-pointer shadow-blue-950/20">
                	Se Connecter
                </div>
                <div className="p-2 rounded-lg bg-amber-200 hover:bg-amber-300 text-blue-800 shadow-md cursor-pointer shadow-amber-800/20">
                	FR
                </div>
                <div className="p-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-blue-50 shadow-md cursor-pointer shadow-amber-50/20">
                	Moon
                </div>
            </div>

        </div>
    )
}
