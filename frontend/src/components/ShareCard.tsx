import { useState } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { TextForm } from "./TextForm"
import { FileForm } from "./FileForm"
import { UserFiles } from "./UserFiles"

interface ShareCardProps {
  onCreateLink: (data: { content?: string; file?: File; expiresAt: Date }) => Promise<string | null>
  onCreateMultipleLinks?: (data: { files: File[]; expiresAt: Date }) => Promise<string[]>
  sessionId?: string | null
}

export function ShareCard({ onCreateLink, onCreateMultipleLinks, sessionId }: ShareCardProps) {
  const [activeTab, setActiveTab] = useState<'text' | 'file' | 'files'>('text')

  const handleTextCreate = async (data: { content: string; expiresAt: Date }) => {
    return await onCreateLink({ content: data.content, expiresAt: data.expiresAt })
  }

  const handleFileCreate = async (data: { file: File; expiresAt: Date }) => {
    return await onCreateLink({ file: data.file, expiresAt: data.expiresAt })
  }

  return (
    <div className="bg-[#131A26]/50 backdrop-blur-sm border border-[#273244] rounded-2xl p-6">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'text' | 'file' | 'files')}>
        <TabsList className={`grid ${sessionId ? 'grid-cols-3' : 'grid-cols-2'} w-full mb-6 bg-[#0B0F1A] border border-[#273244]`}>
          <TabsTrigger
            value="text"
            className="data-[state=active]:bg-[#20C15A] data-[state=active]:text-white text-[#9AA7BD]"
          >
            Text
          </TabsTrigger>
          <TabsTrigger
            value="file"
            className="data-[state=active]:bg-[#20C15A] data-[state=active]:text-white text-[#9AA7BD]"
          >
            File
          </TabsTrigger>
          {sessionId && (
            <TabsTrigger
              value="files"
              className="data-[state=active]:bg-[#20C15A] data-[state=active]:text-white text-[#9AA7BD]"
            >
              Your files
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="text" className="mt-0">
          <TextForm onCreateLink={handleTextCreate} />
        </TabsContent>

        <TabsContent value="file" className="mt-0">
          <FileForm onCreateLink={handleFileCreate} onCreateMultipleLinks={onCreateMultipleLinks} />
        </TabsContent>

        {sessionId && (
          <TabsContent value="files" className="mt-0">
            <UserFiles sessionId={sessionId} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
